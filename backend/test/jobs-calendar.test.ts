import { describe, expect, it } from "vitest";
import { app, request, registerOwner, createClient, createJob } from "./helpers";

describe("jobs calendar (from/to date range)", () => {
  it("returns only jobs scheduled inside the given range, unpaginated", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Range Client" });

    const inRange = await createJob(owner.token, client.id, {
      title: "In range",
      scheduledAt: "2026-06-10T14:00:00.000Z",
    });
    const outOfRange = await createJob(owner.token, client.id, {
      title: "Out of range",
      scheduledAt: "2026-07-01T14:00:00.000Z",
    });
    expect(inRange.status).toBe(201);
    expect(outOfRange.status).toBe(201);

    const res = await request(app)
      .get("/api/jobs")
      .query({ from: "2026-06-08T00:00:00.000Z", to: "2026-06-15T00:00:00.000Z" })
      .set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    const titles = res.body.data.map((j: { title: string }) => j.title);
    expect(titles).toContain("In range");
    expect(titles).not.toContain("Out of range");
    expect(res.body.pagination.totalPages).toBe(1);
  });

  it("does not return an unscheduled job for a date range query", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Unscheduled Client" });
    await createJob(owner.token, client.id, { title: "No time set yet" });

    const res = await request(app)
      .get("/api/jobs")
      .query({ from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T00:00:00.000Z" })
      .set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    const titles = res.body.data.map((j: { title: string }) => j.title);
    expect(titles).not.toContain("No time set yet");
  });

  it("falls back to the normal paginated list when from/to is missing or invalid", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Fallback Client" });
    await createJob(owner.token, client.id, { title: "Plain listed job" });

    const noRange = await request(app).get("/api/jobs").set("Authorization", `Bearer ${owner.token}`);
    expect(noRange.status).toBe(200);
    expect(noRange.body.data.map((j: { title: string }) => j.title)).toContain("Plain listed job");

    const invalidRange = await request(app)
      .get("/api/jobs")
      .query({ from: "not-a-date", to: "also-not-a-date" })
      .set("Authorization", `Bearer ${owner.token}`);
    expect(invalidRange.status).toBe(200);
    expect(invalidRange.body.data.map((j: { title: string }) => j.title)).toContain("Plain listed job");
  });

  it("does not return another organization's jobs in a date range query", async () => {
    const orgA = await registerOwner();
    const orgB = await registerOwner();
    const clientA = await createClient(orgA.token, { name: "Org A Client" });
    const clientB = await createClient(orgB.token, { name: "Org B Client" });

    await createJob(orgA.token, clientA.id, { title: "Org A job", scheduledAt: "2026-08-05T10:00:00.000Z" });
    await createJob(orgB.token, clientB.id, { title: "Org B job", scheduledAt: "2026-08-05T10:00:00.000Z" });

    const res = await request(app)
      .get("/api/jobs")
      .query({ from: "2026-08-01T00:00:00.000Z", to: "2026-08-10T00:00:00.000Z" })
      .set("Authorization", `Bearer ${orgA.token}`);

    const titles = res.body.data.map((j: { title: string }) => j.title);
    expect(titles).toContain("Org A job");
    expect(titles).not.toContain("Org B job");
  });
});
