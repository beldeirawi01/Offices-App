import { describe, expect, it } from "vitest";
import { registerOwner, createClient, createJob, app, request } from "./helpers";

const tinyJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64",
);

const tinyWav = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00,
  0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61,
  0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
]);

describe("upload file signature checking", () => {
  it("rejects an audio upload whose bytes don't match its declared Content-Type", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    // Passes multer's fileFilter (a plausible-looking Content-Type) but the
    // bytes are plain text, not a real audio file — the whole point of
    // checking magic bytes instead of trusting the declared type.
    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/voice-notes`)
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("audio", Buffer.from("definitely not an audio file"), { filename: "note.wav", contentType: "audio/wav" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not look like a valid audio recording/i);
  });

  it("accepts a real WAV file for a voice note", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/voice-notes`)
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("audio", tinyWav, { filename: "note.wav", contentType: "audio/wav" });

    expect(res.status).toBe(202);
  });

  it("rejects a documentation photo whose bytes don't match its declared Content-Type", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field("stage", "ARRIVAL")
      .attach("photo", Buffer.from("definitely not a photo"), { filename: "arrival.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
  });

  it("rejects a documentation entry whose audio bytes don't match its declared Content-Type, even with a real photo", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const res = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/documentation`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field("stage", "ARRIVAL")
      .attach("photo", tinyJpeg, "arrival.jpg")
      .attach("audio", Buffer.from("definitely not audio"), { filename: "note.wav", contentType: "audio/wav" });

    expect(res.status).toBe(400);
  });
});
