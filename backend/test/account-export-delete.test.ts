import { describe, expect, it } from "vitest";
import { app, request, registerOwner, createClient, createJob, prisma } from "./helpers";

describe("account data export", () => {
  it("exports the organization's own data, but not another organization's", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Jane Client" });
    await createJob(owner.token, client.id, { title: "AC repair" });

    const other = await registerOwner();
    await createClient(other.token, { name: "Should not appear" });

    const res = await request(app).get("/api/organizations/me/export").set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.organization.id).toBe(owner.user.organizationId);
    expect(res.body.clients).toHaveLength(1);
    expect(res.body.clients[0].name).toBe("Jane Client");
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].title).toBe("AC repair");
    expect(JSON.stringify(res.body)).not.toContain("Should not appear");
  });

  it("does not include password hashes in the exported user list", async () => {
    const owner = await registerOwner();

    const res = await request(app).get("/api/organizations/me/export").set("Authorization", `Bearer ${owner.token}`);

    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]).not.toHaveProperty("passwordHash");
  });

  it("refuses export to a non-owner", async () => {
    const owner = await registerOwner();
    const techRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Tech", email: `tech-${Date.now()}@test.com`, password: "password123", role: "TECH" });
    const techLogin = await request(app).post("/api/auth/login").send({ email: techRes.body.email, password: "password123" });

    const res = await request(app)
      .get("/api/organizations/me/export")
      .set("Authorization", `Bearer ${techLogin.body.token}`);

    expect(res.status).toBe(403);
  });
});

describe("account deletion", () => {
  it("refuses to delete without the correct password", async () => {
    const owner = await registerOwner();

    const res = await request(app)
      .post("/api/organizations/me/delete")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ password: "wrong-password" });

    expect(res.status).toBe(401);
    const org = await prisma.organization.findUnique({ where: { id: owner.user.organizationId } });
    expect(org).not.toBeNull();
  });

  it("deletes the organization and everything under it, but leaves other organizations untouched", async () => {
    const owner = await registerOwner({ password: "correct-password-123" });
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    await prisma.voiceNote.create({ data: { jobId: jobRes.body.id, audioUrl: "some-key", status: "UPLOADED" } });

    const other = await registerOwner();
    const otherClient = await createClient(other.token);

    const res = await request(app)
      .post("/api/organizations/me/delete")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ password: "correct-password-123" });

    expect(res.status).toBe(204);

    const org = await prisma.organization.findUnique({ where: { id: owner.user.organizationId } });
    expect(org).toBeNull();
    const users = await prisma.user.findMany({ where: { organizationId: owner.user.organizationId } });
    expect(users).toHaveLength(0);
    const clients = await prisma.client.findMany({ where: { organizationId: owner.user.organizationId } });
    expect(clients).toHaveLength(0);
    const jobs = await prisma.job.findMany({ where: { organizationId: owner.user.organizationId } });
    expect(jobs).toHaveLength(0);
    const voiceNotes = await prisma.voiceNote.findMany({ where: { jobId: jobRes.body.id } });
    expect(voiceNotes).toHaveLength(0);

    // The other organization's data is completely unaffected.
    const otherOrg = await prisma.organization.findUnique({ where: { id: other.user.organizationId } });
    expect(otherOrg).not.toBeNull();
    const otherClientStillThere = await prisma.client.findUnique({ where: { id: otherClient.id } });
    expect(otherClientStillThere).not.toBeNull();
  });

  it("refuses deletion to a non-owner", async () => {
    const owner = await registerOwner();
    const techRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Tech", email: `tech-${Date.now()}@test.com`, password: "password123", role: "TECH" });
    const techLogin = await request(app).post("/api/auth/login").send({ email: techRes.body.email, password: "password123" });

    const res = await request(app)
      .post("/api/organizations/me/delete")
      .set("Authorization", `Bearer ${techLogin.body.token}`)
      .send({ password: "password123" });

    expect(res.status).toBe(403);
    const org = await prisma.organization.findUnique({ where: { id: owner.user.organizationId } });
    expect(org).not.toBeNull();
  });
});
