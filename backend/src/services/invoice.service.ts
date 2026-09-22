import { prisma } from "../db/prisma";
import { ExtractedJob } from "./extraction.service";

function generateInvoiceNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `INV-${stamp}-${rand}`;
}

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

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tax = subtotal * org.taxRate;
  const total = subtotal + tax;

  return prisma.invoice.create({
    data: {
      organizationId,
      clientId,
      jobId: jobId ?? undefined,
      invoiceNumber: generateInvoiceNumber(),
      status: "DRAFT",
      laborHours: laborHours ?? undefined,
      laborRate: laborRate ?? undefined,
      subtotal,
      tax,
      total,
      notes: notes ?? undefined,
      dueDate: dueDate ?? undefined,
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

  const lineItems: DraftLineItem[] = [...extracted.lineItems];

  // Claude is instructed to report labor in only one place, but LLM output isn't
  // guaranteed — if it already itemized labor as a lineItem, don't also add the
  // computed laborHours*laborRate amount on top, or the client gets billed twice.
  const alreadyHasLaborLineItem = lineItems.some((item) => item.kind === "LABOR");

  const laborAmount =
    !alreadyHasLaborLineItem && extracted.laborHours != null && extracted.laborRate != null
      ? extracted.laborHours * extracted.laborRate
      : 0;

  if (laborAmount > 0) {
    lineItems.push({
      description: `Labor (${extracted.laborHours} hr @ $${extracted.laborRate}/hr)`,
      quantity: 1,
      unitPrice: laborAmount,
      kind: "LABOR",
    });
  }

  return createInvoiceFromLineItems({
    organizationId,
    clientId,
    jobId,
    lineItems,
    laborHours: extracted.laborHours,
    laborRate: extracted.laborRate,
    notes: extracted.notes ?? extracted.summary,
  });
}
