import { Router } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../db/prisma";
import { HttpError } from "../middleware/errorHandler";
import { renderInvoicePdf } from "../services/pdf.service";

export const publicRouter = Router();

// Unauthenticated by design (clients have no account), so keep this tightly
// rate-limited to blunt token-guessing/enumeration attempts.
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
publicRouter.use(publicLimiter);

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

publicRouter.post("/quotes/:token/accept", async (req, res) => {
  const quote = await prisma.quote.findUnique({ where: { publicToken: req.params.token } });
  if (!quote) throw new HttpError(404, "Quote not found");
  if (quote.status !== "SENT") {
    throw new HttpError(400, `This quote can no longer be responded to (currently ${quote.status.toLowerCase()})`);
  }
  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  });
  res.json({ status: updated.status });
});

publicRouter.post("/quotes/:token/decline", async (req, res) => {
  const quote = await prisma.quote.findUnique({ where: { publicToken: req.params.token } });
  if (!quote) throw new HttpError(404, "Quote not found");
  if (quote.status !== "SENT") {
    throw new HttpError(400, `This quote can no longer be responded to (currently ${quote.status.toLowerCase()})`);
  }
  const updated = await prisma.quote.update({
    where: { id: quote.id },
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
