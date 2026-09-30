import { describe, expect, it } from "vitest";
import { app, request, registerOwner, createClient, createJob, prisma } from "./helpers";

describe("quotes", () => {
  it("creates a manual draft quote with tax applied from the org's rate", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({ where: { id: owner.user.organizationId }, data: { taxRate: 0.1 } });
    const client = await createClient(owner.token, { name: "Quote client" });

    const res = await request(app)
      .post("/api/quotes")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, lineItems: [{ description: "Capacitor", quantity: 1, unitPrice: 100, kind: "PART" }] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.subtotal).toBe(100);
    expect(res.body.tax).toBeCloseTo(10);
    expect(res.body.total).toBeCloseTo(110);
  });

  it("refuses to create a second quote for a job that already has one", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Dupe client" });
    const jobRes = await createJob(owner.token, client.id);

    const body = { clientId: client.id, jobId: jobRes.body.id, lineItems: [{ description: "X", quantity: 1, unitPrice: 50, kind: "PART" }] };
    const first = await request(app).post("/api/quotes").set("Authorization", `Bearer ${owner.token}`).send(body);
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/quotes").set("Authorization", `Bearer ${owner.token}`).send(body);
    expect(second.status).toBe(400);
  });

  it("refuses to send a quote with no email or SMS-consented phone on the client", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "No contact" });
    const create = await request(app)
      .post("/api/quotes")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, lineItems: [{ description: "X", quantity: 1, unitPrice: 50, kind: "PART" }] });

    const res = await request(app).post(`/api/quotes/${create.body.id}/send`).set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(400);
  });

  it("only allows converting an ACCEPTED quote to an invoice", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Convert client", email: "convert@test.com" });
    const create = await request(app)
      .post("/api/quotes")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, lineItems: [{ description: "X", quantity: 1, unitPrice: 200, kind: "PART" }] });

    const draftConvert = await request(app)
      .post(`/api/quotes/${create.body.id}/convert-to-invoice`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(draftConvert.status).toBe(400);

    await prisma.quote.update({ where: { id: create.body.id }, data: { status: "ACCEPTED" } });

    const converted = await request(app)
      .post(`/api/quotes/${create.body.id}/convert-to-invoice`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(converted.status).toBe(201);
    expect(converted.body.total).toBeCloseTo(200);

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: create.body.id } });
    expect(quote.status).toBe("CONVERTED");
    expect(quote.convertedInvoiceId).toBe(converted.body.id);
  });

  it("exposes a working public quote link with accept/decline", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Public quote client", email: "publicquote@test.com" });
    const create = await request(app)
      .post("/api/quotes")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, lineItems: [{ description: "X", quantity: 1, unitPrice: 75, kind: "PART" }] });
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: create.body.id } });

    const notReady = await request(app).post(`/api/public/quotes/${quote.publicToken}/accept`);
    expect(notReady.status).toBe(400); // still DRAFT, not SENT

    await prisma.quote.update({ where: { id: quote.id }, data: { status: "SENT" } });

    const view = await request(app).get(`/api/public/quotes/${quote.publicToken}`);
    expect(view.status).toBe(200);
    expect(view.body.quoteNumber).toBe(quote.quoteNumber);

    const accept = await request(app)
      .post(`/api/public/quotes/${quote.publicToken}/accept`)
      .send({ signerName: "Pat Client", signatureImage: "data:image/png;base64,aGVsbG8=" });
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe("ACCEPTED");
  });

  it("refuses to accept/decline a quote sent more than 90 days ago", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Stale quote client", email: "stalequote@test.com" });
    const create = await request(app)
      .post("/api/quotes")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, lineItems: [{ description: "X", quantity: 1, unitPrice: 75, kind: "PART" }] });
    const staleSentAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const quote = await prisma.quote.update({
      where: { id: create.body.id },
      data: { status: "SENT", sentAt: staleSentAt },
    });

    const accept = await request(app).post(`/api/public/quotes/${quote.publicToken}/accept`);
    expect(accept.status).toBe(410);

    const decline = await request(app).post(`/api/public/quotes/${quote.publicToken}/decline`);
    expect(decline.status).toBe(410);

    // Viewing the quote itself (not acting on it) still works past expiry.
    const view = await request(app).get(`/api/public/quotes/${quote.publicToken}`);
    expect(view.status).toBe(200);
  });

  it("automatically converts an accepted quote to an invoice when the job is marked complete", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Auto convert client" });
    const jobRes = await createJob(owner.token, client.id);
    const create = await request(app)
      .post("/api/quotes")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, jobId: jobRes.body.id, lineItems: [{ description: "X", quantity: 1, unitPrice: 60, kind: "PART" }] });
    await prisma.quote.update({ where: { id: create.body.id }, data: { status: "ACCEPTED" } });

    const complete = await request(app)
      .put(`/api/jobs/${jobRes.body.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ status: "COMPLETED" });
    expect(complete.status).toBe(200);

    const invoice = await prisma.invoice.findUnique({ where: { jobId: jobRes.body.id } });
    expect(invoice).not.toBeNull();
    expect(invoice!.total).toBeCloseTo(60);

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: create.body.id } });
    expect(quote.status).toBe("CONVERTED");
  });
});
