import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/subscription";
import { requireVoiceUsageWithinCap } from "../middleware/voiceUsageCap";
import { HttpError } from "../middleware/errorHandler";
import { transcribeAudio } from "../services/transcription.service";
import { extractJobDetails, extractQuoteDetails, ExtractionValidationError } from "../services/extraction.service";
import { createDraftInvoiceFromExtraction, mergeExtractionIntoInvoice } from "../services/invoice.service";
import { createDraftQuoteFromExtraction } from "../services/quote.service";
import { storeVoiceNoteAudio, getVoiceNoteAudioLocalPath, isCloudStorageConfigured, localUploadDir } from "../services/storage.service";

export const voiceRouter = Router();
// NOTE: this router is mounted at bare "/api" in app.ts (its two routes don't
// share a clean common prefix), so requireAuth must be attached per-route
// below rather than as a router-wide `.use()`. A blanket `.use(requireAuth)`
// here would intercept and 401 every "/api/*" request — including unrelated
// routes like "/api/public/*" mounted after this one — before Express even
// checks whether the path matches one of this router's actual routes.

// Multer always needs a local scratch location to receive the multipart upload;
// when cloud storage is configured, storeVoiceNoteAudio() uploads this file to
// S3 and deletes the local copy immediately after.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, localUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".m4a";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB, matches Whisper's cap
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("audio/")) {
      return cb(new HttpError(400, "Uploaded file must be an audio recording"));
    }
    cb(null, true);
  },
});

/**
 * The core voice-to-invoice pipeline:
 * 1. Tech uploads a voice note for a job
 * 2. Whisper transcribes it
 * 3. Claude extracts structured billing fields
 * 4. A draft invoice is created for the tech to review before sending
 */
voiceRouter.post(
  "/jobs/:jobId/voice-notes",
  requireAuth,
  requireActiveSubscription,
  requireVoiceUsageWithinCap,
  upload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing audio file field 'audio'");
    }

    // QUOTE (on-arrival estimate) or INVOICE (post-job actuals, the default —
    // keeps older mobile app builds that don't send this field working).
    const purpose = req.body.purpose === "QUOTE" ? "QUOTE" : "INVOICE";

    const job = await prisma.job.findFirst({
      where: { id: req.params.jobId, organizationId: req.auth!.organizationId },
      include: { client: true },
    });
    if (!job) throw new HttpError(404, "Job not found");

    const stored = await storeVoiceNoteAudio(req.file.path, req.file.filename, req.file.mimetype);

    const voiceNote = await prisma.voiceNote.create({
      data: {
        jobId: job.id,
        audioUrl: stored.storageKey,
        status: "UPLOADED",
        purpose,
      },
    });

    res.status(202).json({ voiceNoteId: voiceNote.id, status: voiceNote.status });

    // Process asynchronously so the tech isn't stuck waiting on-site;
    // the mobile app polls GET /voice-notes/:id for the result.
    processVoiceNote(voiceNote.id, stored.storageKey, job.id, job.organizationId, job.clientId, purpose).catch((err) => {
      console.error(`Voice note ${voiceNote.id} processing failed`, err);
    });
  },
);

async function processVoiceNote(
  voiceNoteId: string,
  storageKey: string,
  jobId: string,
  organizationId: string,
  clientId: string,
  purpose: "QUOTE" | "INVOICE",
) {
  let localPath: string | null = null;
  try {
    await prisma.voiceNote.update({ where: { id: voiceNoteId }, data: { status: "TRANSCRIBING" } });
    localPath = await getVoiceNoteAudioLocalPath(storageKey);
    const transcript = await transcribeAudio(localPath);
    await prisma.voiceNote.update({
      where: { id: voiceNoteId },
      data: { status: "TRANSCRIBED", transcript },
    });

    await prisma.voiceNote.update({ where: { id: voiceNoteId }, data: { status: "EXTRACTING" } });
    const extraction = purpose === "QUOTE" ? await extractQuoteDetails(transcript) : await extractJobDetails(transcript);
    const extracted = extraction.result;
    await prisma.voiceNote.update({
      where: { id: voiceNoteId },
      data: { status: "EXTRACTED", extractedJson: extracted as any, rawExtraction: extraction.raw },
    });

    if (purpose === "QUOTE") {
      const existingQuote = await prisma.quote.findUnique({ where: { jobId } });
      if (!existingQuote) {
        await createDraftQuoteFromExtraction({ organizationId, clientId, jobId, extracted });
      }
    } else {
      const existingInvoice = await prisma.invoice.findUnique({ where: { jobId } });
      if (!existingInvoice) {
        await createDraftInvoiceFromExtraction({ organizationId, clientId, jobId, extracted });
      } else {
        // A job can get more than one completion note (e.g. the tech records
        // progress throughout instead of just once at the end) — fold every
        // note's line items into the one draft invoice rather than only the
        // first note winning. No-ops if the invoice has already been sent.
        await mergeExtractionIntoInvoice(existingInvoice.id, extracted);
      }
    }
  } catch (err) {
    await prisma.voiceNote.update({
      where: { id: voiceNoteId },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        // A validation failure still carries what Claude actually said, so a
        // hallucinated/malformed extraction can be debugged after the fact.
        ...(err instanceof ExtractionValidationError ? { rawExtraction: err.rawOutput } : {}),
      },
    });
  } finally {
    // If audio was downloaded from S3 into a scratch temp file, clean it up.
    if (localPath && isCloudStorageConfigured()) {
      fs.unlink(localPath, () => {});
    }
  }
}

voiceRouter.get("/voice-notes/:id", requireAuth, requireActiveSubscription, async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({
    where: { id: req.params.id, job: { organizationId: req.auth!.organizationId } },
    include: {
      job: {
        include: {
          invoice: { include: { lineItems: true } },
          quote: { include: { lineItems: true } },
        },
      },
    },
  });
  if (!voiceNote) throw new HttpError(404, "Voice note not found");
  res.json(voiceNote);
});
