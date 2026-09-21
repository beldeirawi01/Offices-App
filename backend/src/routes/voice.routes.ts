import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { transcribeAudio } from "../services/transcription.service";
import { extractJobDetails } from "../services/extraction.service";
import { createDraftInvoiceFromExtraction } from "../services/invoice.service";

export const voiceRouter = Router();
voiceRouter.use(requireAuth);

const uploadDir = path.join(process.cwd(), "uploads", "voice-notes");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".m4a";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB, matches Whisper's cap
});

/**
 * The core voice-to-invoice pipeline:
 * 1. Tech uploads a voice note for a job
 * 2. Whisper transcribes it
 * 3. Claude extracts structured billing fields
 * 4. A draft invoice is created for the tech to review before sending
 */
voiceRouter.post("/jobs/:jobId/voice-notes", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, "Missing audio file field 'audio'");
  }

  const job = await prisma.job.findFirst({
    where: { id: req.params.jobId, organizationId: req.auth!.organizationId },
    include: { client: true },
  });
  if (!job) throw new HttpError(404, "Job not found");

  const voiceNote = await prisma.voiceNote.create({
    data: {
      jobId: job.id,
      audioUrl: req.file.path,
      status: "UPLOADED",
    },
  });

  res.status(202).json({ voiceNoteId: voiceNote.id, status: voiceNote.status });

  // Process asynchronously so the tech isn't stuck waiting on-site;
  // the mobile app polls GET /voice-notes/:id for the result.
  processVoiceNote(voiceNote.id, req.file.path, job.id, job.organizationId, job.clientId).catch((err) => {
    console.error(`Voice note ${voiceNote.id} processing failed`, err);
  });
});

async function processVoiceNote(
  voiceNoteId: string,
  filePath: string,
  jobId: string,
  organizationId: string,
  clientId: string,
) {
  try {
    await prisma.voiceNote.update({ where: { id: voiceNoteId }, data: { status: "TRANSCRIBING" } });
    const transcript = await transcribeAudio(filePath);
    await prisma.voiceNote.update({
      where: { id: voiceNoteId },
      data: { status: "TRANSCRIBED", transcript },
    });

    await prisma.voiceNote.update({ where: { id: voiceNoteId }, data: { status: "EXTRACTING" } });
    const extracted = await extractJobDetails(transcript);
    await prisma.voiceNote.update({
      where: { id: voiceNoteId },
      data: { status: "EXTRACTED", extractedJson: extracted as any },
    });

    const existingInvoice = await prisma.invoice.findUnique({ where: { jobId } });
    if (!existingInvoice) {
      await createDraftInvoiceFromExtraction({ organizationId, clientId, jobId, extracted });
    }
  } catch (err) {
    await prisma.voiceNote.update({
      where: { id: voiceNoteId },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : "Unknown error" },
    });
  }
}

voiceRouter.get("/voice-notes/:id", async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({
    where: { id: req.params.id, job: { organizationId: req.auth!.organizationId } },
    include: { job: { include: { invoice: { include: { lineItems: true } } } } },
  });
  if (!voiceNote) throw new HttpError(404, "Voice note not found");
  res.json(voiceNote);
});
