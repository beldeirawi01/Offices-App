import { describe, expect, it } from "vitest";
import { registerOwner, createClient, createJob, prisma } from "./helpers";
import { createDraftInvoiceFromExtraction, createInvoiceFromLineItems, mergeExtractionIntoInvoice } from "../src/services/invoice.service";
import { createQuoteFromLineItems } from "../src/services/quote.service";
import type { ExtractedJob } from "../src/services/extraction.service";

describe("createDraftInvoiceFromExtraction", () => {
  it("adds a computed labor line item from laborHours/laborRate when none was itemized", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const job = jobRes.body;

    const extracted: ExtractedJob = {
      customerName: "Jane",
      jobType: "Plumbing",
      summary: "Fixed a leak",
      laborHours: 2,
      laborRate: 90,
      lineItems: [{ description: "Pipe fitting", quantity: 1, unitPrice: 15, kind: "PART" }],
      notes: null,
    };

    const invoice = await createDraftInvoiceFromExtraction({
      organizationId: owner.user.organizationId,
      clientId: client.id,
      jobId: job.id,
      extracted,
    });

    const laborItems = invoice.lineItems.filter((i) => i.kind === "LABOR");
    expect(laborItems).toHaveLength(1);
    expect(laborItems[0].amount.toNumber()).toBe(180);
    expect(invoice.subtotal.toNumber()).toBe(15 + 180);
  });

  it("does not double-bill labor when extraction already itemized a LABOR line item", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const job = jobRes.body;

    // Model mistakenly reported labor both ways — the backstop should skip the computed one.
    const extracted: ExtractedJob = {
      customerName: "Jane",
      jobType: "Plumbing",
      summary: "Fixed a leak",
      laborHours: 2,
      laborRate: 90,
      lineItems: [{ description: "Labor / service call", quantity: 1, unitPrice: 180, kind: "LABOR" }],
      notes: null,
    };

    const invoice = await createDraftInvoiceFromExtraction({
      organizationId: owner.user.organizationId,
      clientId: client.id,
      jobId: job.id,
      extracted,
    });

    const laborItems = invoice.lineItems.filter((i) => i.kind === "LABOR");
    expect(laborItems).toHaveLength(1);
    expect(invoice.subtotal.toNumber()).toBe(180);
  });
});

describe("mergeExtractionIntoInvoice", () => {
  it("folds a second voice note's line items into the existing draft instead of discarding them", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({ where: { id: owner.user.organizationId }, data: { taxRate: 0.1 } });
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const job = jobRes.body;

    const first: ExtractedJob = {
      customerName: "Jane",
      jobType: "Plumbing",
      summary: "Arrived, diagnosed a leak",
      laborHours: null,
      laborRate: null,
      lineItems: [{ description: "Pipe fitting", quantity: 1, unitPrice: 15, kind: "PART" }],
      notes: null,
    };
    const invoice = await createDraftInvoiceFromExtraction({
      organizationId: owner.user.organizationId,
      clientId: client.id,
      jobId: job.id,
      extracted: first,
    });
    expect(invoice.subtotal).toBeCloseTo(15);

    const second: ExtractedJob = {
      customerName: "Jane",
      jobType: "Plumbing",
      summary: "Finished the repair",
      laborHours: 1,
      laborRate: 100,
      lineItems: [],
      notes: "Replaced a second fitting that was also corroded",
    };
    const merged = await mergeExtractionIntoInvoice(invoice.id, second);

    expect(merged.lineItems).toHaveLength(2);
    expect(merged.subtotal).toBeCloseTo(115);
    expect(merged.tax).toBeCloseTo(11.5);
    expect(merged.total).toBeCloseTo(126.5);
    expect(merged.notes).toContain("corroded");
  });

  it("does not modify an invoice that has already been sent", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const job = jobRes.body;

    const extracted: ExtractedJob = {
      customerName: "Jane",
      jobType: "Plumbing",
      summary: "Fixed a leak",
      laborHours: null,
      laborRate: null,
      lineItems: [{ description: "Pipe fitting", quantity: 1, unitPrice: 15, kind: "PART" }],
      notes: null,
    };
    const invoice = await createDraftInvoiceFromExtraction({
      organizationId: owner.user.organizationId,
      clientId: client.id,
      jobId: job.id,
      extracted,
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "SENT" } });

    await mergeExtractionIntoInvoice(invoice.id, {
      ...extracted,
      lineItems: [{ description: "Extra part", quantity: 1, unitPrice: 999, kind: "PART" }],
    });

    const lineItems = await prisma.lineItem.findMany({ where: { invoiceId: invoice.id } });
    expect(lineItems).toHaveLength(1);
  });
});

describe("sequential invoice/quote numbers", () => {
  it("assigns increasing per-organization invoice numbers instead of a timestamp+random string", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const lineItems = [{ description: "Part", quantity: 1, unitPrice: 10, kind: "PART" as const }];

    const first = await createInvoiceFromLineItems({ organizationId: owner.user.organizationId, clientId: client.id, lineItems });
    const second = await createInvoiceFromLineItems({ organizationId: owner.user.organizationId, clientId: client.id, lineItems });

    expect(first.invoiceNumber).toBe("INV-000001");
    expect(second.invoiceNumber).toBe("INV-000002");
  });

  it("keeps each organization's invoice sequence independent of every other org's", async () => {
    const ownerA = await registerOwner();
    const clientA = await createClient(ownerA.token);
    const ownerB = await registerOwner();
    const clientB = await createClient(ownerB.token);
    const lineItems = [{ description: "Part", quantity: 1, unitPrice: 10, kind: "PART" as const }];

    await createInvoiceFromLineItems({ organizationId: ownerA.user.organizationId, clientId: clientA.id, lineItems });
    const secondForA = await createInvoiceFromLineItems({ organizationId: ownerA.user.organizationId, clientId: clientA.id, lineItems });
    const firstForB = await createInvoiceFromLineItems({ organizationId: ownerB.user.organizationId, clientId: clientB.id, lineItems });

    expect(secondForA.invoiceNumber).toBe("INV-000002");
    expect(firstForB.invoiceNumber).toBe("INV-000001");
  });

  it("assigns increasing per-organization quote numbers on the same pattern", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const lineItems = [{ description: "Part", quantity: 1, unitPrice: 10, kind: "PART" as const }];

    const first = await createQuoteFromLineItems({ organizationId: owner.user.organizationId, clientId: client.id, lineItems });
    const second = await createQuoteFromLineItems({ organizationId: owner.user.organizationId, clientId: client.id, lineItems });

    expect(first.quoteNumber).toBe("QTE-000001");
    expect(second.quoteNumber).toBe("QTE-000002");
  });
});
