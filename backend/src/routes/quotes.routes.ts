import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/subscription";
import { HttpError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { deliverQuoteToClient } from "../services/notification.service";
import { createQuoteFromLineItems, convertQuoteToInvoice } from "../services/quote.service";
import { DraftLineItem } from "../services/invoice.service";
import { lineItemAmount, sumMoney, calculateTax } from "../utils/money";

export const quotesRouter = Router();
quotesRouter.use(requireAuth);
quotesRouter.use(requireActiveSubscription);

const MAX_PAGE_SIZE = 100;
function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(query.pageSize ?? "25"), 10) || 25));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

quotesRouter.get("/", async (req, res) => {
  const { status, search } = req.query;
  const { skip, take, page, pageSize } = parsePagination(req.query as Record<string, unknown>);
  const where = {
    organizationId: req.auth!.organizationId,
    ...(status ? { status: status as any } : {}),
    ...(typeof search === "string" && search
      ? {
          OR: [
            { quoteNumber: { contains: search, mode: "insensitive" as const } },
            { client: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      include: { client: true, lineItems: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.quote.count({ where }),
  ]);
  res.json({ data: quotes, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});

quotesRouter.get("/:id", async (req, res) => {
  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
    include: { client: true, lineItems: true, deliveries: true, job: true },
  });
  if (!quote) throw new HttpError(404, "Quote not found");
  res.json(quote);
});

const lineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  kind: z.enum(["PART", "LABOR"]),
});

const quoteCreateSchema = z.object({
  clientId: z.string(),
  jobId: z.string().optional().nullable(),
  lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
  notes: z.string().optional().nullable(),
});

// Manual quote creation — for a quote given over the phone, in person without
// recording, or for testing, without needing a voice note first.
quotesRouter.post("/", async (req, res) => {
  const body = quoteCreateSchema.parse(req.body);
  const organizationId = req.auth!.organizationId;

  const client = await prisma.client.findFirst({ where: { id: body.clientId, organizationId } });
  if (!client) throw new HttpError(400, "Invalid clientId");

  if (body.jobId) {
    const job = await prisma.job.findFirst({ where: { id: body.jobId, organizationId } });
    if (!job) throw new HttpError(400, "Invalid jobId");
    const existingQuote = await prisma.quote.findUnique({ where: { jobId: body.jobId } });
    if (existingQuote) throw new HttpError(400, "This job already has a quote");
  }

  const quote = await createQuoteFromLineItems({
    organizationId,
    clientId: body.clientId,
    jobId: body.jobId,
    lineItems: body.lineItems as DraftLineItem[],
    notes: body.notes,
  });

  res.status(201).json(quote);
});

const quoteUpdateSchema = z.object({
  notes: z.string().optional().nullable(),
  lineItems: z.array(lineItemSchema).optional(),
});

// Techs review/edit the AI-generated quote before it goes out.
quotesRouter.put("/:id", async (req, res) => {
  const body = quoteUpdateSchema.parse(req.body);
  const existing = await prisma.quote.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!existing) throw new HttpError(404, "Quote not found");
  if (existing.status !== "DRAFT") {
    throw new HttpError(400, "Only draft quotes can be edited");
  }

  if (body.lineItems) {
    await prisma.quoteLineItem.deleteMany({ where: { quoteId: existing.id } });
    await prisma.quoteLineItem.createMany({
      data: body.lineItems.map((item) => ({
        quoteId: existing.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: lineItemAmount(item.quantity, item.unitPrice),
        kind: item.kind,
      })),
    });
  }

  const [lineItems, org] = await Promise.all([
    prisma.quoteLineItem.findMany({ where: { quoteId: existing.id } }),
    prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } }),
  ]);
  const subtotal = sumMoney(lineItems.map((item) => item.amount));
  const tax = calculateTax(subtotal, org.taxRate);

  const quote = await prisma.quote.update({
    where: { id: existing.id },
    data: {
      notes: body.notes ?? existing.notes,
      subtotal,
      tax,
      total: subtotal.plus(tax),
    },
    include: { lineItems: true },
  });

  res.json(quote);
});

// Sends the quote to the client for approval — no Stripe/payment step,
// unlike invoices, since nothing is being charged yet.
quotesRouter.post("/:id/send", async (req, res) => {
  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
    include: { client: true, organization: true },
  });
  if (!quote) throw new HttpError(404, "Quote not found");
  if (quote.status === "ACCEPTED" || quote.status === "DECLINED" || quote.status === "CONVERTED") {
    throw new HttpError(400, `Cannot send a quote that is already ${quote.status.toLowerCase()}`);
  }
  const canEmail = Boolean(quote.client.email);
  const canText = Boolean(quote.client.phone && quote.client.smsConsent);
  if (!canEmail && !canText) {
    throw new HttpError(
      400,
      quote.client.phone && !quote.client.smsConsent
        ? "Client has a phone number but has not consented to SMS, and has no email on file"
        : "Client has no email or SMS-consented phone number on file to deliver the quote to",
    );
  }

  const pageUrl = `${env.appBaseUrl}/quotes/view/${quote.publicToken}`;

  const deliveryResults = await deliverQuoteToClient({
    clientEmail: quote.client.email,
    clientPhone: quote.client.phone,
    clientSmsConsent: quote.client.smsConsent,
    quoteNumber: quote.quoteNumber,
    pageUrl,
    total: quote.total,
    businessName: quote.organization.name,
  });

  await prisma.quoteDelivery.createMany({
    data: deliveryResults.map((r) => ({
      quoteId: quote.id,
      channel: r.channel,
      recipient: r.recipient,
      success: r.success,
      errorMessage: r.error,
    })),
  });

  const anyDelivered = deliveryResults.some((r) => r.success);
  if (!anyDelivered) {
    throw new HttpError(502, "Failed to deliver the quote over every configured channel");
  }

  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "SENT", sentAt: new Date() },
    include: { lineItems: true, deliveries: true },
  });

  res.json({ quote: updated, deliveryResults });
});

// Manual conversion, in addition to the automatic one that fires when the
// tied job is marked complete (see jobs.routes.ts).
quotesRouter.post("/:id/convert-to-invoice", async (req, res) => {
  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!quote) throw new HttpError(404, "Quote not found");

  const invoice = await convertQuoteToInvoice(quote.id);
  res.status(201).json(invoice);
});
