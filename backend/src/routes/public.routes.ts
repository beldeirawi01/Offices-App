import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { HttpError } from "../middleware/errorHandler";
import { renderInvoicePdf } from "../services/pdf.service";

export const publicRouter = Router();

// A drawn signature as a data URL (e.g. "data:image/png;base64,...") — capped
// well above what a real canvas-drawn signature needs (a few KB) but far
// below anything that could be used to stuff arbitrary large payloads into
// this unauthenticated endpoint.
const signatureSchema = z.object({
  signerName: z.string().trim().min(1, "Please type your name to sign").max(200),
  signatureImage: z
    .string()
    .startsWith("data:image/", "Signature must be a drawn image")
    .max(300_000, "Signature image is too large"),
});

// Unauthenticated by design (clients have no account), so keep this tightly
// rate-limited to blunt token-guessing/enumeration attempts.
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
publicRouter.use(publicLimiter);

// A quote is a time-sensitive proposal — pricing quoted 4 months ago
// shouldn't be bindable today. Viewing/PDF access never expires (clients
// reasonably want the record later), only the accept/decline action does.
const QUOTE_ACCEPT_EXPIRY_DAYS = 90;
function isQuoteLinkExpired(sentAt: Date | null): boolean {
  if (!sentAt) return false;
  return Date.now() - sentAt.getTime() > QUOTE_ACCEPT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

// Client-facing invoice view — the link sent by SMS/email. Deliberately
// returns only what a client needs to see, never internal ids or other data.
publicRouter.get("/invoices/:token", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: req.params.token },
    include: { lineItems: true, organization: true, client: { select: { name: true } } },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");

  res.json({
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    createdAt: invoice.createdAt,
    dueDate: invoice.dueDate,
    organizationName: invoice.organization.name,
    clientName: invoice.client.name,
    lineItems: invoice.lineItems.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: i.amount,
    })),
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    notes: invoice.notes,
    paymentUrl: invoice.status === "PAID" ? null : invoice.stripePaymentLinkUrl,
  });
});

// Client-facing quote view — same pattern as the invoice one above, plus an
// accept/decline action since a quote is a proposal, not a bill.
publicRouter.get("/quotes/:token", async (req, res) => {
  const quote = await prisma.quote.findUnique({
    where: { publicToken: req.params.token },
    include: { lineItems: true, organization: true, client: { select: { name: true } } },
  });
  if (!quote) throw new HttpError(404, "Quote not found");

  res.json({
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    createdAt: quote.createdAt,
    organizationName: quote.organization.name,
    clientName: quote.client.name,
    lineItems: quote.lineItems.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: i.amount,
    })),
    subtotal: quote.subtotal,
    tax: quote.tax,
    total: quote.total,
    notes: quote.notes,
  });
});

// Accepting a quote is the moment it becomes a binding agreement to do the
// work at this price, so it requires an e-signature — a typed name plus a
// drawn signature captured on the public page — rather than a bare button
// click.
publicRouter.post("/quotes/:token/accept", async (req, res) => {
  const quote = await prisma.quote.findUnique({ where: { publicToken: req.params.token } });
  if (!quote) throw new HttpError(404, "Quote not found");
  if (quote.status !== "SENT") {
    throw new HttpError(400, `This quote can no longer be responded to (currently ${quote.status.toLowerCase()})`);
  }
  if (isQuoteLinkExpired(quote.sentAt)) {
    throw new HttpError(410, "This quote has expired. Please contact the business for updated pricing.");
  }
  // Validated after the state checks above, so an already-responded-to or
  // expired quote gets that specific error rather than a generic "missing
  // signature" one regardless of what the request body happened to contain.
  const body = signatureSchema.parse(req.body);
  const [updated] = await prisma.$transaction([
    prisma.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED", respondedAt: new Date() } }),
    prisma.signature.create({
      data: {
        quoteId: quote.id,
        signerName: body.signerName,
        signatureImage: body.signatureImage,
        ipAddress: req.ip,
      },
    }),
  ]);
  res.json({ status: updated.status });
});

publicRouter.post("/quotes/:token/decline", async (req, res) => {
  const quote = await prisma.quote.findUnique({ where: { publicToken: req.params.token } });
  if (!quote) throw new HttpError(404, "Quote not found");
  if (quote.status !== "SENT") {
    throw new HttpError(400, `This quote can no longer be responded to (currently ${quote.status.toLowerCase()})`);
  }
  if (isQuoteLinkExpired(quote.sentAt)) {
    throw new HttpError(410, "This quote has expired. Please contact the business for updated pricing.");
  }
  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  res.json({ status: updated.status });
});

// Client-facing change-order view — a scope/price addition discovered
// mid-job that needs sign-off before it's binding (see ChangeOrder in
// schema.prisma for why this doesn't touch any invoice automatically).
publicRouter.get("/change-orders/:token", async (req, res) => {
  const changeOrder = await prisma.changeOrder.findUnique({
    where: { publicToken: req.params.token },
    include: { organization: { select: { name: true } }, job: { select: { title: true, client: { select: { name: true } } } } },
  });
  if (!changeOrder) throw new HttpError(404, "Change order not found");

  res.json({
    description: changeOrder.description,
    amount: changeOrder.amount,
    status: changeOrder.status,
    createdAt: changeOrder.createdAt,
    organizationName: changeOrder.organization.name,
    clientName: changeOrder.job.client.name,
    jobTitle: changeOrder.job.title,
  });
});

// Approving is the client's sign-off that this additional work/cost is
// authorized — same e-signature requirement as accepting a quote.
publicRouter.post("/change-orders/:token/approve", async (req, res) => {
  const changeOrder = await prisma.changeOrder.findUnique({ where: { publicToken: req.params.token } });
  if (!changeOrder) throw new HttpError(404, "Change order not found");
  if (changeOrder.status !== "PENDING") {
    throw new HttpError(400, `This change order can no longer be responded to (currently ${changeOrder.status.toLowerCase()})`);
  }
  const body = signatureSchema.parse(req.body);

  const [updated] = await prisma.$transaction([
    prisma.changeOrder.update({ where: { id: changeOrder.id }, data: { status: "APPROVED", respondedAt: new Date() } }),
    prisma.signature.create({
      data: {
        changeOrderId: changeOrder.id,
        signerName: body.signerName,
        signatureImage: body.signatureImage,
        ipAddress: req.ip,
      },
    }),
  ]);
  res.json({ status: updated.status });
});

publicRouter.post("/change-orders/:token/decline", async (req, res) => {
  const changeOrder = await prisma.changeOrder.findUnique({ where: { publicToken: req.params.token } });
  if (!changeOrder) throw new HttpError(404, "Change order not found");
  if (changeOrder.status !== "PENDING") {
    throw new HttpError(400, `This change order can no longer be responded to (currently ${changeOrder.status.toLowerCase()})`);
  }
  const updated = await prisma.changeOrder.update({
    where: { id: changeOrder.id },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  res.json({ status: updated.status });
});

publicRouter.get("/invoices/:token/pdf", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: req.params.token },
    include: { lineItems: true, organization: true, client: true },
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
