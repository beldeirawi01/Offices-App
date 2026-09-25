import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, requireOwner } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/subscription";
import { HttpError } from "../middleware/errorHandler";
import { transcribeAudio } from "../services/transcription.service";
import {
  storeJobPhoto,
  storeVoiceNoteAudio,
  getVoiceNoteAudioLocalPath,
  getJobPhotoSignedUrl,
  isCloudStorageConfigured,
  localPhotoUploadDir,
  localUploadDir,
} from "../services/storage.service";

export const documentationRouter = Router();
// NOTE: mounted at bare "/api" in app.ts, same reasoning as voiceRouter — its
// routes don't share one clean prefix ("/jobs/:jobId/documentation" for
// create/list, "/documentation/:id" for the rest), so requireAuth is applied
// per-route rather than with a router-wide `.use()`.

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, file.fieldname === "audio" ? localUploadDir : localPhotoUploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || (file.fieldname === "audio" ? ".m4a" : ".jpg");
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const stageSchema = z.enum(["ARRIVAL", "MID_JOB", "COMPLETION"]);

/**
 * Captures a photo (required) plus an optional voice note at a specific
 * point in the job — kept as standalone dispute/warranty evidence, separate
 * from the general job-notes timeline that feeds the invoice.
 */
documentationRouter.post(
  "/jobs/:jobId/documentation",
  requireAuth,
  requireActiveSubscription,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as { photo?: Express.Multer.File[]; audio?: Express.Multer.File[] } | undefined;
    const photoFile = files?.photo?.[0];
    if (!photoFile) throw new HttpError(400, "Missing photo file field 'photo'");

    const stage = stageSchema.parse(req.body.stage);
    const latitude = req.body.latitude != null && req.body.latitude !== "" ? Number(req.body.latitude) : undefined;
    const longitude = req.body.longitude != null && req.body.longitude !== "" ? Number(req.body.longitude) : undefined;

    const job = await prisma.job.findFirst({ where: { id: req.params.jobId, organizationId: req.auth!.organizationId } });
    if (!job) throw new HttpError(404, "Job not found");

    const storedPhoto = await storeJobPhoto(photoFile.path, photoFile.filename);
    const audioFile = files?.audio?.[0];
    const storedAudio = audioFile ? await storeVoiceNoteAudio(audioFile.path, audioFile.filename) : null;

    const doc = await prisma.jobDocumentation.create({
      data: {
        jobId: job.id,
        stage,
        photoStorageKey: storedPhoto.storageKey,
        audioStorageKey: storedAudio?.storageKey,
        latitude,
        longitude,
        status: storedAudio ? "UPLOADED" : "TRANSCRIBED", // nothing to transcribe without audio
      },
    });

    res.status(201).json(doc);

    if (storedAudio) {
      transcribeDocumentationAudio(doc.id, storedAudio.storageKey).catch((err) => {
        console.error(`Documentation ${doc.id} transcription failed`, err);
      });
    }
  },
);

async function transcribeDocumentationAudio(documentationId: string, storageKey: string) {
  let localPath: string | null = null;
  try {
    await prisma.jobDocumentation.update({ where: { id: documentationId }, data: { status: "TRANSCRIBING" } });
    localPath = await getVoiceNoteAudioLocalPath(storageKey);
    const transcript = await transcribeAudio(localPath);
    await prisma.jobDocumentation.update({
      where: { id: documentationId },
      data: { status: "TRANSCRIBED", transcript },
    });
  } catch (err) {
    await prisma.jobDocumentation.update({
      where: { id: documentationId },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : "Unknown error" },
    });
  } finally {
    if (localPath && isCloudStorageConfigured()) {
      fs.unlink(localPath, () => {});
    }
  }
}

documentationRouter.get("/jobs/:jobId/documentation", requireAuth, requireActiveSubscription, async (req, res) => {
  const job = await prisma.job.findFirst({ where: { id: req.params.jobId, organizationId: req.auth!.organizationId } });
  if (!job) throw new HttpError(404, "Job not found");

  const docs = await prisma.jobDocumentation.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(docs);
});

// Streams (local disk) or redirects to a short-lived signed URL (S3) for the
// photo — kept behind auth since this is liability evidence, not a
// client-facing link like an invoice/quote's public token.
documentationRouter.get("/documentation/:id/photo", requireAuth, requireActiveSubscription, async (req, res) => {
  const doc = await prisma.jobDocumentation.findFirst({
    where: { id: req.params.id, job: { organizationId: req.auth!.organizationId } },
  });
  if (!doc) throw new HttpError(404, "Documentation not found");

  if (isCloudStorageConfigured()) {
    const url = await getJobPhotoSignedUrl(doc.photoStorageKey);
    return res.redirect(url);
  }
  return res.sendFile(doc.photoStorageKey);
});

const updateSchema = z.object({ clientFacing: z.boolean() });

// Owner-only: approving a photo to appear on the client-facing invoice is a
// judgment call about what the client should see, not something a tech
// records in the field.
documentationRouter.put("/documentation/:id", requireAuth, requireActiveSubscription, requireOwner, async (req, res) => {
  const body = updateSchema.parse(req.body);
  const existing = await prisma.jobDocumentation.findFirst({
    where: { id: req.params.id, job: { organizationId: req.auth!.organizationId } },
  });
  if (!existing) throw new HttpError(404, "Documentation not found");

  const doc = await prisma.jobDocumentation.update({ where: { id: existing.id }, data: { clientFacing: body.clientFacing } });
  res.json(doc);
});
