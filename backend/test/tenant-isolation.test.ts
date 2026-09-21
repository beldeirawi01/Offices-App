import { describe, expect, it } from "vitest";
import { app, request, registerOwner, createClient } from "./helpers";

describe("cross-tenant isolation", () => {
  it("rejects creating a job with a clientId belonging to another organization", async () => {
    const orgA = await registerOwner();
    const orgB = await registerOwner();

    const clientInOrgB = await createClient(orgB.token, { name: "Org B's Client" });

    // Org A tries to create a job pointed at Org B's client.
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", `Bearer ${orgA.token}`)
      .send({ clientId: clientInOrgB.id, title: "Sneaky job" });

    expect(res.status).toBe(400);
  });

  it("rejects assigning a job to a tech from another organization", async () => {
    const orgA = await registerOwner();
    const orgB = await registerOwner();

    const clientInOrgA = await createClient(orgA.token, { name: "Org A's Client" });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", `Bearer ${orgA.token}`)
      .send({ clientId: clientInOrgA.id, title: "Job", assignedTechId: orgB.user.id });

    expect(res.status).toBe(400);
  });

  it("does not return another organization's clients", async () => {
    const orgA = await registerOwner();
    const orgB = await registerOwner();

    await createClient(orgA.token, { name: "Visible to A" });
    await createClient(orgB.token, { name: "Visible to B" });

    const res = await request(app).get("/api/clients").set("Authorization", `Bearer ${orgA.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.map((c: { name: string }) => c.name);
    expect(names).toContain("Visible to A");
    expect(names).not.toContain("Visible to B");
  });

  it("404s when fetching another organization's client by id directly", async () => {
    const orgA = await registerOwner();
    const orgB = await registerOwner();

    const clientInOrgB = await createClient(orgB.token, { name: "Org B's Client" });

    const res = await request(app).get(`/api/clients/${clientInOrgB.id}`).set("Authorization", `Bearer ${orgA.token}`);

    expect(res.status).toBe(404);
  });
});
