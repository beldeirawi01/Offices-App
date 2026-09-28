import { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { HttpError } from "./errorHandler";

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Bounds worst-case Whisper/Claude spend from one heavy or runaway
 * organization — every voice note, and every documentation entry that
 * includes audio, triggers a real transcription call. Counted together
 * against one monthly cap since both draw from the same cost exposure.
 */
async function currentMonthVoiceUsage(organizationId: string): Promise<number> {
  const periodStart = startOfCurrentMonthUtc();
  const [voiceNoteCount, documentationWithAudioCount] = await Promise.all([
    prisma.voiceNote.count({ where: { job: { organizationId }, createdAt: { gte: periodStart } } }),
    prisma.jobDocumentation.count({
      where: { job: { organizationId }, audioStorageKey: { not: null }, createdAt: { gte: periodStart } },
    }),
  ]);
  return voiceNoteCount + documentationWithAudioCount;
}

function capMessage(): string {
  return `This organization has reached its voice/audio upload limit for this month (${env.maxVoiceUploadsPerOrgPerMonth}). Contact support if you need a higher limit.`;
}

/** Throws if the org is already at or over its monthly cap. */
export async function assertWithinVoiceUsageCap(organizationId: string): Promise<void> {
  const used = await currentMonthVoiceUsage(organizationId);
  if (used >= env.maxVoiceUploadsPerOrgPerMonth) {
    throw new HttpError(429, capMessage());
  }
}

/**
 * Express middleware form for the voice-note upload route, where audio is
 * always required — placed before the multer upload so a rejected request
 * never wastes bandwidth/storage on a file that's going to be discarded.
 * Documentation uploads (where audio is optional) call
 * assertWithinVoiceUsageCap directly instead, after multer has parsed the
 * body, since only then is it known whether this particular request
 * actually includes audio at all.
 */
export async function requireVoiceUsageWithinCap(req: Request, res: Response, next: NextFunction) {
  await assertWithinVoiceUsageCap(req.auth!.organizationId);
  next();
}
