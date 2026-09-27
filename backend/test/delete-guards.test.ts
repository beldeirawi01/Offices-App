import { describe, expect, it } from "vitest";
import { registerOwner, createClient, createJob, app, request, prisma } from "./helpers";

describe("delete guards against dangling references", () => {
  it("refuses to delete a client that still has a job on file", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    await createJob(owner.token, client.id);

    const res = await request(app).delete(`/api/clients/${client.id}`).set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/jobs or invoices/i);
  });

  it("deletes a client with no jobs or invoices", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);

    const res = await request(app).delete(`/api/clients/${client.id}`).set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(204);
  });

  it("refuses to delete a job that already has a recorded voice note", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    await prisma.voiceNote.create({
      data: { jobId: jobRes.body.id, audioUrl: "test-key", status: "UPLOADED" },
    });

    const res = await request(app).delete(`/api/jobs/${jobRes.body.id}`).set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/quote, invoice, or recorded notes/i);
  });

  it("deleting a job with a quote orphans the quote instead of failing (quotes can stand alone)", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const quoteRes = await request(app)
      .post("/api/quotes")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, jobId: jobRes.body.id, lineItems: [{ description: "x", quantity: 1, unitPrice: 50, kind: "PART" }] });

    const res = await request(app).delete(`/api/jobs/${jobRes.body.id}`).set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(204);

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteRes.body.id } });
    expect(quote.jobId).toBeNull();
  });

  it("deletes a job with no quote, invoice, or notes", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const res = await request(app).delete(`/api/jobs/${jobRes.body.id}`).set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(204);
  });
});
