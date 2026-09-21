import { describe, expect, it } from "vitest";
import { registerOwner, createClient, createJob, prisma } from "./helpers";
import { createDraftInvoiceFromExtraction } from "../src/services/invoice.service";
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
    expect(laborItems[0].amount).toBe(180);
    expect(invoice.subtotal).toBe(15 + 180);
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
    expect(invoice.subtotal).toBe(180);
  });
});
