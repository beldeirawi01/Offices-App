import { describe, expect, it } from "vitest";
import { app, request, registerOwner, createClient, prisma } from "./helpers";

async function createDraftInvoice(token: string, organizationId: string, clientId: string) {
  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      clientId,
      invoiceNumber: `INV-TEST-${Date.now()}-${Math.random()}`,
      status: "DRAFT",
      subtotal: 100,
      tax: 0,
      total: 100,
    },
  });
  return invoice;
}

describe("invoice send guards", () => {
  it("refuses to send a client with no email and no SMS-consented phone", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "No contact info" });
    const invoice = await createDraftInvoice(owner.token, owner.user.organizationId, client.id);

    const res = await request(app).post(`/api/invoices/${invoice.id}/send`).set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(400);
  });

  it("refuses to send a client with a phone but no SMS consent and no email", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Phone only", phone: "+15555550100" });
    const invoice = await createDraftInvoice(owner.token, owner.user.organizationId, client.id);

    const res = await request(app).post(`/api/invoices/${invoice.id}/send`).set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/consent/i);
  });

  it("refuses to re-send a PAID invoice", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Paid client", email: "paid@test.com" });
    const invoice = await createDraftInvoice(owner.token, owner.user.organizationId, client.id);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: new Date() } });

    const res = await request(app).post(`/api/invoices/${invoice.id}/send`).set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(400);
  });

  it("refuses to send a VOID invoice", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Voided client", email: "void@test.com" });
    const invoice = await createDraftInvoice(owner.token, owner.user.organizationId, client.id);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VOID" } });

    const res = await request(app).post(`/api/invoices/${invoice.id}/send`).set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(400);
  });

  it("refuses to send an invoice before Stripe onboarding is complete", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Ready client", email: "ready@test.com" });
    const invoice = await createDraftInvoice(owner.token, owner.user.organizationId, client.id);

    const res = await request(app).post(`/api/invoices/${invoice.id}/send`).set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stripe/i);
  });

  it("void endpoint marks a draft invoice VOID", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "To void", email: "tovoid@test.com" });
    const invoice = await createDraftInvoice(owner.token, owner.user.organizationId, client.id);

    const res = await request(app).post(`/api/invoices/${invoice.id}/void`).set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("VOID");
  });

  it("exposes a working public invoice link with no auth required", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Public link client" });
    const invoice = await createDraftInvoice(owner.token, owner.user.organizationId, client.id);

    const res = await request(app).get(`/api/public/invoices/${invoice.publicToken}`);

    expect(res.status).toBe(200);
    expect(res.body.invoiceNumber).toBe(invoice.invoiceNumber);
  });

  it("404s the public invoice endpoint for a bogus token", async () => {
    const res = await request(app).get("/api/public/invoices/does-not-exist");
    expect(res.status).toBe(404);
  });
});
