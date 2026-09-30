import { describe, expect, it } from "vitest";
import { app, request, registerOwner, createClient, createJob, prisma } from "./helpers";

const validSignature = { signerName: "Pat Client", signatureImage: "data:image/png;base64,aGVsbG8=" };

describe("change orders", () => {
  it("creates a change order for a job", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "Found corroded wiring, needs replacing", amount: 150 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.amount).toBe(150);
    expect(res.body.publicToken).toBeTruthy();
  });

  it("rejects a non-positive amount", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "X", amount: 0 });
    expect(res.status).toBe(400);
  });

  it("lists change orders for a job, newest first, with signature info once signed", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const first = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "First", amount: 50 });
    const second = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "Second", amount: 75 });

    await request(app)
      .post(`/api/public/change-orders/${second.body.publicToken}/approve`)
      .send(validSignature);

    const res = await request(app)
      .get(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(second.body.id);
    expect(res.body[0].signature.signerName).toBe("Pat Client");
    expect(res.body[1].id).toBe(first.body.id);
    expect(res.body[1].signature).toBeNull();
  });

  it("refuses to send a change order when the client has no email or SMS-consented phone", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token); // no email/phone set
    const jobRes = await createJob(owner.token, client.id);
    const create = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "X", amount: 50 });

    const res = await request(app)
      .post(`/api/change-orders/${create.body.id}/send`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(400);
  });

  it("does not expose another organization's change orders", async () => {
    const owner = await registerOwner();
    const other = await registerOwner();
    const otherClient = await createClient(other.token);
    const otherJobRes = await createJob(other.token, otherClient.id);
    await request(app)
      .post(`/api/jobs/${otherJobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({ description: "X", amount: 50 });

    const res = await request(app)
      .get(`/api/jobs/${otherJobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(404);
  });
});

describe("public change-order approve/decline", () => {
  it("shows a change order's details without authentication", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id, { title: "AC repair" });
    const create = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "Found corroded wiring", amount: 150 });

    const res = await request(app).get(`/api/public/change-orders/${create.body.publicToken}`);
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Found corroded wiring");
    expect(res.body.amount).toBe(150);
    expect(res.body.jobTitle).toBe("AC repair");
    expect(res.body.status).toBe("PENDING");
  });

  it("approves with a signature and records signer name, image, and IP", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const create = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "X", amount: 50 });

    const res = await request(app)
      .post(`/api/public/change-orders/${create.body.publicToken}/approve`)
      .send(validSignature);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");

    const signature = await prisma.signature.findUniqueOrThrow({ where: { changeOrderId: create.body.id } });
    expect(signature.signerName).toBe("Pat Client");
    expect(signature.signatureImage).toBe(validSignature.signatureImage);
    expect(signature.ipAddress).toBeTruthy();
  });

  it("rejects approval without a signature", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const create = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "X", amount: 50 });

    const res = await request(app).post(`/api/public/change-orders/${create.body.publicToken}/approve`).send({});
    expect(res.status).toBe(400);
  });

  it("declines without requiring a signature", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const create = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "X", amount: 50 });

    const res = await request(app).post(`/api/public/change-orders/${create.body.publicToken}/decline`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DECLINED");
  });

  it("refuses to respond to a change order twice", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const create = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/change-orders`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "X", amount: 50 });

    await request(app).post(`/api/public/change-orders/${create.body.publicToken}/decline`);
    const secondAttempt = await request(app)
      .post(`/api/public/change-orders/${create.body.publicToken}/approve`)
      .send(validSignature);
    expect(secondAttempt.status).toBe(400);
  });

  it("404s for an unknown token", async () => {
    const res = await request(app).get("/api/public/change-orders/nonexistent-token");
    expect(res.status).toBe(404);
  });
});
