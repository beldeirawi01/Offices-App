import { describe, expect, it, vi } from "vitest";
import fs from "fs";

// Real Whisper/Claude calls need API keys this test env doesn't have, and
// aren't the point here — this test is about what happens to the audio file
// once the pipeline succeeds, not about the extraction quality itself.
vi.mock("../src/services/transcription.service", () => ({
  transcribeAudio: vi.fn().mockResolvedValue("Replaced the capacitor. Two hours labor at one hundred dollars an hour."),
}));

vi.mock("../src/services/extraction.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/extraction.service")>();
  return {
    ...actual,
    extractJobDetails: vi.fn().mockResolvedValue({
      result: {
        customerName: null,
        jobType: null,
        summary: "Capacitor replacement",
        laborHours: 2,
        laborRate: 100,
        lineItems: [{ description: "Capacitor", quantity: 1, unitPrice: 50, kind: "PART" }],
        notes: null,
      },
      raw: "{}",
    }),
  };
});

import { app, request, registerOwner, createClient, createJob, prisma } from "./helpers";

const tinyWav = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00,
  0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61,
  0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
]);

async function waitForStatus(voiceNoteId: string, status: string, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const note = await prisma.voiceNote.findUniqueOrThrow({ where: { id: voiceNoteId } });
    if (note.status === status || note.status === "FAILED") return note;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for voice note ${voiceNoteId} to reach ${status}`);
}

describe("voice note audio cleanup", () => {
  it("deletes the audio file once the pipeline reaches EXTRACTED, keeping the transcript", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const uploadRes = await request(app)
      .post(`/api/jobs/${jobRes.body.id}/voice-notes`)
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("audio", tinyWav, { filename: "note.wav", contentType: "audio/wav" });
    expect(uploadRes.status).toBe(202);

    const uploaded = await prisma.voiceNote.findUniqueOrThrow({ where: { id: uploadRes.body.voiceNoteId } });
    expect(fs.existsSync(uploaded.audioUrl)).toBe(true);
    expect(uploaded.audioDeleted).toBe(false);

    const final = await waitForStatus(uploadRes.body.voiceNoteId, "EXTRACTED");

    expect(final.status).toBe("EXTRACTED");
    expect(final.transcript).toBeTruthy();
    expect(final.audioDeleted).toBe(true);
    expect(fs.existsSync(final.audioUrl)).toBe(false);
  });
});
