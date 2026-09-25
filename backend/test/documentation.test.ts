import { describe, expect, it } from "vitest";
import { app, request, registerOwner, createClient, createJob, prisma } from "./helpers";

const tinyJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64",
);

describe("job documentation", () => {
  it("creates a photo-only documentation entry without touching transcription", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field("stage", "ARRIVAL")
      .field("latitude", "41.87")
      .field("longitude", "-87.62")
      .attach("photo", tinyJpeg, "arrival.jpg");

    expect(res.status).toBe(201);
    expect(res.body.stage).toBe("ARRIVAL");
    expect(res.body.status).toBe("TRANSCRIBED"); // no audio attached, nothing to transcribe
    expect(res.body.latitude).toBeCloseTo(41.87);
    expect(res.body.audioStorageKey).toBeNull();
  });

  it("rejects an upload with no photo file", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field("stage", "ARRIVAL");

    expect(res.status).toBe(400);
  });

  it("lists documentation entries for a job in chronological order", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    await request(app)
      .post(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field("stage", "ARRIVAL")
      .attach("photo", tinyJpeg, "a.jpg");
    await request(app)
      .post(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field("stage", "COMPLETION")
      .attach("photo", tinyJpeg, "b.jpg");

    const res = await request(app)
      .get(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].stage).toBe("ARRIVAL");
    expect(res.body[1].stage).toBe("COMPLETION");
  });

  it("blocks a tech from marking a photo client-facing, but allows the owner", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const create = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field("stage", "COMPLETION")
      .attach("photo", tinyJpeg, "after.jpg");

    const techRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Tech One", email: `tech-${Date.now()}@test.com`, password: "password123", role: "TECH" });
    const techLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: techRes.body.email, password: "password123" });

    const blocked = await request(app)
      .put(`/api/documentation/${create.body.id}`)
      .set("Authorization", `Bearer ${techLogin.body.token}`)
      .send({ clientFacing: true });
    expect(blocked.status).toBe(403);

    const allowed = await request(app)
      .put(`/api/documentation/${create.body.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientFacing: true });
    expect(allowed.status).toBe(200);
    expect(allowed.body.clientFacing).toBe(true);
  });

  it("does not expose another organization's documentation", async () => {
    const owner = await registerOwner();
    const other = await registerOwner();
    const otherClient = await createClient(other.token);
    const otherJob = await createJob(other.token, otherClient.id);

    const create = await request(app)
      .post(`/api/jobs/${otherJob.body.id}/documentation`)
      .set("Authorization", `Bearer ${other.token}`)
      .field("stage", "ARRIVAL")
      .attach("photo", tinyJpeg, "a.jpg");

    const res = await request(app)
      .get(`/api/documentation/${create.body.id}/photo`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(404);
  });
});
