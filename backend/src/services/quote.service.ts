import { prisma } from "../db/prisma";
import { ExtractedJob } from "./extraction.service";
import { DraftLineItem } from "./invoice.service";
import { HttpError } from "../middleware/errorHandler";

function generateQuoteNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `QTE-${stamp}-${rand}`;
}

/**
 * Creates a DRAFT quote from a fixed set of line items, applying the same
 * tax math as invoices so an accepted quote converts into an invoice with a
 * matching total.
 */
export async function createQuoteFromLineItems(params: {
  organizationId: string;
  clientId: string;
  jobId?: string | null;
  lineItems: DraftLineItem[];
  laborHours?: number | null;
  laborRate?: number | null;
  notes?: string | null;
}) {
  const { organizationId, clientId, jobId, lineItems, laborHours, laborRate, notes } = params;

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tax = subtotal * org.taxRate;
  const total = subtotal + tax;

  return prisma.quote.create({
    data: {
      organizationId,
      clientId,
      jobId: jobId ?? undefined,
      quoteNumber: generateQuoteNumber(),
      status: "DRAFT",
      laborHours: laborHours ?? undefined,
      laborRate: laborRate ?? undefined,
      subtotal,
      tax,
      total,
      notes: notes ?? undefined,
      lineItems: {
        create: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
          kind: item.kind,
        })),
      },
    },
    include: { lineItems: true },
  });
}

/**
 * Turns Claude's structured estimate extraction into a draft quote tied to
 * the job, ready for the tech to review/edit before it goes out. Mirrors
 * createDraftInvoiceFromExtraction in invoice.service.ts.
 */
export async function createDraftQuoteFromExtraction(params: {
  organizationId: string;
  clientId: string;
  jobId: string;
  extracted: ExtractedJob;
}) {
  const { organizationId, clientId, jobId, extracted } = params;

  const lineItems: DraftLineItem[] = [...extracted.lineItems];
  const alreadyHasLaborLineItem = lineItems.some((item) => item.kind === "LABOR");

  const laborAmount =
    !alreadyHasLaborLineItem && extracted.laborHours != null && extracted.laborRate != null
      ? extracted.laborHours * extracted.laborRate
      : 0;

  if (laborAmount > 0) {
    lineItems.push({
      description: `Labor (est. ${extracted.laborHours} hr @ $${extracted.laborRate}/hr)`,
      quantity: 1,
      unitPrice: laborAmount,
      kind: "LABOR",
    });
  }

  return createQuoteFromLineItems({
    organizationId,
    clientId,
    jobId,
    lineItems,
    laborHours: extracted.laborHours,
    laborRate: extracted.laborRate,
    notes: extracted.notes ?? extracted.summary,
  });
}

/**
 * Converts an ACCEPTED quote into a DRAFT invoice pre-filled from its line
 * items — triggered automatically when the tied job is marked complete, or
 * manually from the dashboard. A quote can only be converted once.
 */
export async function convertQuoteToInvoice(quoteId: string) {
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: { lineItems: true },
  });

  if (quote.status === "CONVERTED") {
    throw new HttpError(400, "This quote has already been converted to an invoice");
  }
  if (quote.status !== "ACCEPTED") {
    throw new HttpError(400, "Only an accepted quote can be converted to an invoice");
  }
  if (quote.jobId) {
    const existingInvoice = await prisma.invoice.findUnique({ where: { jobId: quote.jobId } });
    if (existingInvoice) throw new HttpError(400, "This job already has an invoice");
  }

  // Local import to avoid a circular import at module-load time (invoice.service
  // doesn't import quote.service, but keeping this lazy keeps the dependency
  // direction obviously one-way).
  const { createInvoiceFromLineItems } = await import("./invoice.service");

  const invoice = await createInvoiceFromLineItems({
    organizationId: quote.organizationId,
    clientId: quote.clientId,
    jobId: quote.jobId,
    lineItems: quote.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      kind: item.kind as "PART" | "LABOR",
    })),
    laborHours: quote.laborHours,
    laborRate: quote.laborRate,
    notes: quote.notes,
  });

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "CONVERTED", convertedInvoiceId: invoice.id },
  });

  return invoice;
}
