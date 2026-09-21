import { prisma } from "../db/prisma";
import { ExtractedJob } from "./extraction.service";

const TAX_RATE = 0; // configurable per organization in a future iteration

function generateInvoiceNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `INV-${stamp}-${rand}`;
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

  const lineItems = [...extracted.lineItems];

  const laborAmount =
    extracted.laborHours != null && extracted.laborRate != null
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

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      clientId,
      jobId,
      invoiceNumber: generateInvoiceNumber(),
      status: "DRAFT",
      laborHours: extracted.laborHours ?? undefined,
      laborRate: extracted.laborRate ?? undefined,
      subtotal,
      tax,
      total,
      notes: extracted.notes ?? extracted.summary,
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

  return invoice;
}
