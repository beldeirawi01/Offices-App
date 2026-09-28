import { afterEach, describe, expect, it, vi } from "vitest";

// A minimal-but-real WAV header (RIFF/WAVE magic bytes) — the backend now
// checks actual file signatures rather than trusting the declared
// Content-Type (see backend/src/utils/fileSignature.ts), so a plain text
// buffer no longer passes as "audio" here.
const tinyWav = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00,
  0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61,
  0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
]);

// MAX_VOICE_UPLOADS_PER_ORG_PER_MONTH is read once at env.ts module load, so
// testing a non-default cap means resetting the module registry and
// re-importing everything (env, app, and the test helpers, which hold their
// own reference to the built app) fresh, after setting the env var — same
// pattern as env.test.ts and min-app-version.test.ts.
afterEach(() => {
  delete process.env.MAX_VOICE_UPLOADS_PER_ORG_PER_MONTH;
  vi.resetModules();
});

async function loadAppWithCap(cap: string) {
  vi.resetModules();
  process.env.MAX_VOICE_UPLOADS_PER_ORG_PER_MONTH = cap;
  return import("./helpers");
}

describe("per-org voice/documentation usage cap", () => {
  it("blocks a voice-note upload once the org is already at its monthly cap", async () => {
    const { app, request, registerOwner, createClient, createJob, prisma } = await loadAppWithCap("1");

    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    // One voice note already on file this month puts the org at the cap of 1.
    await prisma.voiceNote.create({ data: { jobId: jobRes.body.id, audioUrl: "existing-key", status: "UPLOADED" } });

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/voice-notes`)
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("audio", tinyWav, { filename: "note.wav", contentType: "audio/wav" });

    expect(res.status).toBe(429);
  });

  it("allows a voice-note upload when comfortably under the cap", async () => {
    const { app, request, registerOwner, createClient, createJob } = await loadAppWithCap("100");

    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/voice-notes`)
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("audio", tinyWav, { filename: "note.wav", contentType: "audio/wav" });

    expect(res.status).toBe(202);
  });

  it("does not block a photo-only documentation entry even when the org is at its cap", async () => {
    const { app, request, registerOwner, createClient, createJob, prisma } = await loadAppWithCap("1");

    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    await prisma.voiceNote.create({ data: { jobId: jobRes.body.id, audioUrl: "existing-key", status: "UPLOADED" } });

    const tinyJpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
      "base64",
    );

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field("stage", "ARRIVAL")
      .attach("photo", tinyJpeg, "arrival.jpg");

    expect(res.status).toBe(201);
  });

  it("blocks a documentation entry that includes audio when the org is at its cap", async () => {
    const { app, request, registerOwner, createClient, createJob, prisma } = await loadAppWithCap("1");

    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    await prisma.voiceNote.create({ data: { jobId: jobRes.body.id, audioUrl: "existing-key", status: "UPLOADED" } });

    const tinyJpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
      "base64",
    );

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field("stage", "ARRIVAL")
      .attach("photo", tinyJpeg, "arrival.jpg")
      .attach("audio", tinyWav, { filename: "note.wav", contentType: "audio/wav" });

    expect(res.status).toBe(429);
  });
});
