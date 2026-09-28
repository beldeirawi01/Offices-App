import { describe, expect, it } from "vitest";
import { app, request, registerOwner, createClient, createJob, prisma } from "./helpers";

describe("manual invoice creation", () => {
  it("creates a draft invoice with tax applied from the org's rate", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({ where: { id: owner.user.organizationId }, data: { taxRate: 0.1 } });
    const client = await createClient(owner.token);

    const res = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, lineItems: [{ description: "Parts", quantity: 2, unitPrice: 50, kind: "PART" }] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.subtotal).toBe(100);
    expect(res.body.tax).toBeCloseTo(10);
    expect(res.body.total).toBeCloseTo(110);
  });

  it("rejects a clientId from another organization", async () => {
    const owner = await registerOwner();
    const other = await registerOwner();
    const otherClient = await createClient(other.token);

    const res = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: otherClient.id, lineItems: [{ description: "x", quantity: 1, unitPrice: 1, kind: "PART" }] });

    expect(res.status).toBe(400);
  });

  it("rejects a jobId that already has an invoice", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, jobId: jobRes.body.id, lineItems: [{ description: "x", quantity: 1, unitPrice: 1, kind: "PART" }] });

    const res = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, jobId: jobRes.body.id, lineItems: [{ description: "y", quantity: 1, unitPrice: 1, kind: "PART" }] });

    expect(res.status).toBe(400);
  });
});

describe("mark invoice paid manually", () => {
  it("marks a sent invoice paid and creates a payment record", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const createRes = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, lineItems: [{ description: "x", quantity: 1, unitPrice: 200, kind: "LABOR" }] });

    const res = await request(app)
      .post(`/api/invoices/${createRes.body.id}/mark-paid`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PAID");

    const payments = await prisma.payment.findMany({ where: { invoiceId: createRes.body.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].amount.toNumber()).toBe(200);
  });

  it("refuses to mark an already-paid invoice paid again", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const createRes = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, lineItems: [{ description: "x", quantity: 1, unitPrice: 50, kind: "PART" }] });

    await request(app).post(`/api/invoices/${createRes.body.id}/mark-paid`).set("Authorization", `Bearer ${owner.token}`);
    const res = await request(app).post(`/api/invoices/${createRes.body.id}/mark-paid`).set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(400);
  });
});

describe("password management", () => {
  it("changes password with correct current password, rejects wrong one", async () => {
    const owner = await registerOwner({ password: "originalpass" });

    const wrong = await request(app)
      .put("/api/auth/password")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ currentPassword: "wrong-password", newPassword: "newpassword123" });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .put("/api/auth/password")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ currentPassword: "originalpass", newPassword: "newpassword123" });
    expect(ok.status).toBe(200);

    const login = await request(app).post("/api/auth/login").send({ email: owner.body.email, password: "newpassword123" });
    expect(login.status).toBe(200);
  });

  it("forgot-password always returns success regardless of whether the email exists", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@nowhere.test" });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid reset token", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({ token: "garbage", newPassword: "newpassword123" });
    expect(res.status).toBe(400);
  });
});

describe("team member removal", () => {
  it("prevents removing the only owner", async () => {
    const owner = await registerOwner();
    const res = await request(app)
      .delete(`/api/users/${owner.user.id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(400);
  });

  it("unassigns a removed tech's jobs instead of failing", async () => {
    const owner = await registerOwner();
    const inviteRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Tech One", email: `tech-${Date.now()}@test.com`, password: "password123", role: "TECH" });
    const tech = inviteRes.body;

    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id, { assignedTechId: tech.id });

    const delRes = await request(app).delete(`/api/users/${tech.id}`).set("Authorization", `Bearer ${owner.token}`);
    expect(delRes.status).toBe(204);

    const job = await prisma.job.findUnique({ where: { id: jobRes.body.id } });
    expect(job?.assignedTechId).toBeNull();
  });
});
