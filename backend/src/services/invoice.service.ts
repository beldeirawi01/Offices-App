import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ExtractedJob } from "./extraction.service";
import { lineItemAmount, sumMoney, calculateTax } from "../utils/money";

export interface DraftLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  kind: "PART" | "LABOR";
}

/**
 * Creates a DRAFT invoice from a fixed set of line items, applying the
 * organization's configured tax rate. Shared by both the voice-pipeline
 * auto-draft and manual invoice creation, so tax math never drifts between
 * the two paths.
 */
export async function createInvoiceFromLineItems(params: {
  organizationId: string;
  clientId: string;
  jobId?: string | null;
  lineItems: DraftLineItem[];
  laborHours?: number | null;
  laborRate?: number | null;
  notes?: string | null;
  dueDate?: Date | null;
}) {
  const { organizationId, clientId, jobId, lineItems, laborHours, laborRate, notes, dueDate } = params;

  // Atomically claims the next sequence number and reads the org's tax rate
  // in one round trip — `{ increment: 1 }` compiles to a single
  // `UPDATE ... SET "invoiceSequence" = "invoiceSequence" + 1`, so concurrent
  // invoice creation for the same org can't collide on the same number.
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: { invoiceSequence: { increment: 1 } },
  });
  const invoiceNumber = `INV-${String(org.invoiceSequence).padStart(6, "0")}`;

  const lineItemAmounts = lineItems.map((item) => lineItemAmount(item.quantity, item.unitPrice));
  const subtotal = sumMoney(lineItemAmounts);
  const tax = calculateTax(subtotal, org.taxRate);
  const total = subtotal.plus(tax);

  return prisma.invoice.create({
    data: {
      organizationId,
      clientId,
      jobId: jobId ?? undefined,
      invoiceNumber,
      status: "DRAFT",
      laborHours: laborHours ?? undefined,
      laborRate: laborRate ?? undefined,
      subtotal,
      tax,
      total,
      notes: notes ?? undefined,
      dueDate: dueDate ?? undefined,
      lineItems: {
        create: lineItems.map((item, i) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: lineItemAmounts[i],
          kind: item.kind,
        })),
      },
    },
    include: { lineItems: true },
  });
}

function buildLineItemsFromExtraction(extracted: ExtractedJob): DraftLineItem[] {
  const lineItems: DraftLineItem[] = [...extracted.lineItems];

  // Claude is instructed to report labor in only one place, but LLM output isn't
  // guaranteed — if it already itemized labor as a lineItem, don't also add the
  // computed laborHours*laborRate amount on top, or the client gets billed twice.
  const alreadyHasLaborLineItem = lineItems.some((item) => item.kind === "LABOR");

  const laborAmount =
    !alreadyHasLaborLineItem && extracted.laborHours != null && extracted.laborRate != null
      ? new Prisma.Decimal(extracted.laborHours).times(extracted.laborRate).toDecimalPlaces(2).toNumber()
      : 0;

  if (laborAmount > 0) {
    lineItems.push({
      description: `Labor (${extracted.laborHours} hr @ $${extracted.laborRate}/hr)`,
      quantity: 1,
      unitPrice: laborAmount,
      kind: "LABOR",
    });
  }

  return lineItems;
}

/**
 * Turns Claude's structured extraction into a draft invoice tied to the job,
 * ready for the tech to review/edit in the app before it goes out.
 */
export async function createDraftInvoiceFromExtraction(params: {
  organizationId: string;
  clientId: string;
  jobId: string;
  extracted: ExtractedJob;
}) {
  const { organizationId, clientId, jobId, extracted } = params;

  return createInvoiceFromLineItems({
    organizationId,
    clientId,
    jobId,
    lineItems: buildLineItemsFromExtraction(extracted),
    laborHours: extracted.laborHours,
    laborRate: extracted.laborRate,
    notes: extracted.notes ?? extracted.summary,
  });
}

/**
 * Adds a later voice note's extracted line items onto an existing DRAFT
 * invoice for the same job, rather than discarding them — a job can get
 * multiple completion notes (e.g. progress updates throughout the visit),
 * and the final invoice should reflect all of them, not just the first.
 * No-ops silently if the invoice has already been sent, since editing a
 * sent invoice from a background job isn't something the tech can review.
 */
export async function mergeExtractionIntoInvoice(invoiceId: string, extracted: ExtractedJob) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.status !== "DRAFT") return invoice;

  const newLineItems = buildLineItemsFromExtraction(extracted);
  await prisma.lineItem.createMany({
    data: newLineItems.map((item) => ({
      invoiceId: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: lineItemAmount(item.quantity, item.unitPrice),
      kind: item.kind,
    })),
  });

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: invoice.organizationId } });
  const allLineItems = await prisma.lineItem.findMany({ where: { invoiceId: invoice.id } });
  const subtotal = sumMoney(allLineItems.map((item) => item.amount));
  const tax = calculateTax(subtotal, org.taxRate);
  const total = subtotal.plus(tax);
  const notes = [invoice.notes, extracted.notes ?? extracted.summary].filter(Boolean).join("\n\n");

  return prisma.invoice.update({
    where: { id: invoice.id },
    data: { subtotal, tax, total, notes: notes || undefined },
    include: { lineItems: true },
  });
}
