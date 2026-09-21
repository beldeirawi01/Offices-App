import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { createPaymentLinkForInvoice } from "../services/payment.service";
import { deliverInvoiceToClient } from "../services/notification.service";
import { renderInvoicePdf } from "../services/pdf.service";

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

const MAX_PAGE_SIZE = 100;
function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(query.pageSize ?? "25"), 10) || 25));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

invoicesRouter.get("/", async (req, res) => {
  const { status } = req.query;
  const { skip, take, page, pageSize } = parsePagination(req.query as Record<string, unknown>);
  const where = {
    organizationId: req.auth!.organizationId,
    ...(status ? { status: status as any } : {}),
  };
  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { client: true, lineItems: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.invoice.count({ where }),
  ]);
  res.json({ data: invoices, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});

invoicesRouter.get("/:id", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
    include: { client: true, lineItems: true, payments: true, deliveries: true, job: true },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");
  res.json(invoice);
});

invoicesRouter.get("/:id/pdf", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
    include: { client: true, lineItems: true, organization: true },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");

  const pdf = await renderInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    createdAt: invoice.createdAt,
    dueDate: invoice.dueDate,
    status: invoice.status,
    organizationName: invoice.organization.name,
    client: invoice.client,
    lineItems: invoice.lineItems,
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    notes: invoice.notes,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
  res.send(pdf);
});

const lineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  kind: z.enum(["PART", "LABOR"]),
});

const invoiceUpdateSchema = z.object({
  notes: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  lineItems: z.array(lineItemSchema).optional(),
});

// Techs review/edit the AI-generated invoice before it goes out.
invoicesRouter.put("/:id", async (req, res) => {
  const body = invoiceUpdateSchema.parse(req.body);
  const existing = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!existing) throw new HttpError(404, "Invoice not found");
  if (existing.status !== "DRAFT") {
    throw new HttpError(400, "Only draft invoices can be edited");
  }

  if (body.lineItems) {
    await prisma.lineItem.deleteMany({ where: { invoiceId: existing.id } });
    await prisma.lineItem.createMany({
      data: body.lineItems.map((item) => ({
        invoiceId: existing.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.quantity * item.unitPrice,
        kind: item.kind,
      })),
    });
  }

  const lineItems = await prisma.lineItem.findMany({ where: { invoiceId: existing.id } });
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const invoice = await prisma.invoice.update({
    where: { id: existing.id },
    data: {
      notes: body.notes ?? existing.notes,
      dueDate: body.dueDate ?? existing.dueDate,
      subtotal,
      total: subtotal + existing.tax,
    },
    include: { lineItems: true },
  });

  res.json(invoice);
});

// Automated client delivery: create a Stripe payment link, then send by SMS/email.
invoicesRouter.post("/:id/send", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
    include: { client: true },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");
  if (invoice.status === "PAID" || invoice.status === "VOID") {
    throw new HttpError(400, `Cannot send an invoice that is already ${invoice.status.toLowerCase()}`);
  }
  const canEmail = Boolean(invoice.client.email);
  const canText = Boolean(invoice.client.phone && invoice.client.smsConsent);
  if (!canEmail && !canText) {
    throw new HttpError(
      400,
      invoice.client.phone && !invoice.client.smsConsent
        ? "Client has a phone number but has not consented to SMS, and has no email on file"
        : "Client has no email or SMS-consented phone number on file to deliver the invoice to",
    );
  }

  let paymentUrl = invoice.stripePaymentLinkUrl ?? undefined;

  if (!paymentUrl) {
    const link = await createPaymentLinkForInvoice({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalCents: Math.round(invoice.total * 100),
    });
    paymentUrl = link.url;
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripePaymentLinkId: link.id, stripePaymentLinkUrl: link.url },
    });
  }

  const pageUrl = `${env.appBaseUrl}/pay/${invoice.publicToken}`;

  const deliveryResults = await deliverInvoiceToClient({
    clientEmail: invoice.client.email,
    clientPhone: invoice.client.phone,
    clientSmsConsent: invoice.client.smsConsent,
    invoiceNumber: invoice.invoiceNumber,
    pageUrl,
    total: invoice.total,
  });

  await prisma.invoiceDelivery.createMany({
    data: deliveryResults.map((r) => ({
      invoiceId: invoice.id,
      channel: r.channel,
      recipient: r.recipient,
      success: r.success,
      errorMessage: r.error,
    })),
  });

  const anyDelivered = deliveryResults.some((r) => r.success);
  if (!anyDelivered) {
    throw new HttpError(502, "Failed to deliver the invoice over every configured channel");
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "SENT", sentAt: new Date() },
    include: { lineItems: true, deliveries: true },
  });

  res.json({ invoice: updated, deliveryResults });
});

invoicesRouter.post("/:id/void", async (req, res) => {
  const existing = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!existing) throw new HttpError(404, "Invoice not found");

  const invoice = await prisma.invoice.update({ where: { id: existing.id }, data: { status: "VOID" } });
  res.json(invoice);
});
