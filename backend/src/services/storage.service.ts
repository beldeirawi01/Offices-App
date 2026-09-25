import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const isS3Configured = Boolean(env.s3Bucket && env.s3AccessKeyId && env.s3SecretAccessKey);

const localUploadDir = path.join(process.cwd(), "uploads", "voice-notes");
fs.mkdirSync(localUploadDir, { recursive: true });

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.s3Region,
      endpoint: env.s3Endpoint || undefined,
      credentials: { accessKeyId: env.s3AccessKeyId, secretAccessKey: env.s3SecretAccessKey },
    });
  }
  return s3Client;
}

export interface StoredAudio {
  /** Opaque reference stored in the DB (S3 key or local file path). */
  storageKey: string;
}

/**
 * Persists a recorded voice note's audio. Uses S3-compatible storage when
 * configured (required for production — most hosts have ephemeral disks);
 * falls back to local disk for zero-config local development.
 */
export async function storeVoiceNoteAudio(localTempPath: string, filename: string): Promise<StoredAudio> {
  if (!isS3Configured) {
    return { storageKey: localTempPath };
  }

  const key = `voice-notes/${filename}`;
  const body = fs.readFileSync(localTempPath);
  await getS3Client().send(
    new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: body, ContentType: "audio/m4a" }),
  );
  // Local temp file (from multer's disk storage) is no longer needed once uploaded.
  fs.unlink(localTempPath, () => {});
  return { storageKey: key };
}

/**
 * Returns a local filesystem path Whisper can read from. For S3-backed
 * storage this downloads to a scratch temp file first (Whisper's SDK needs a
 * file stream, not a URL).
 */
export async function getVoiceNoteAudioLocalPath(storageKey: string): Promise<string> {
  if (!isS3Configured) {
    return storageKey; // already a local path
  }

  const tempPath = path.join(process.cwd(), "uploads", "voice-notes-tmp", path.basename(storageKey));
  fs.mkdirSync(path.dirname(tempPath), { recursive: true });

  const object = await getS3Client().send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: storageKey }));
  const chunks: Buffer[] = [];
  for await (const chunk of object.Body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  fs.writeFileSync(tempPath, Buffer.concat(chunks));
  return tempPath;
}

const localPhotoUploadDir = path.join(process.cwd(), "uploads", "job-photos");
fs.mkdirSync(localPhotoUploadDir, { recursive: true });

/**
 * Persists a job-documentation photo — same S3-or-local-disk strategy as
 * voice note audio, kept in a separate key prefix/directory.
 */
export async function storeJobPhoto(localTempPath: string, filename: string): Promise<StoredAudio> {
  if (!isS3Configured) {
    return { storageKey: localTempPath };
  }

  const key = `job-photos/${filename}`;
  const body = fs.readFileSync(localTempPath);
  await getS3Client().send(
    new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: body, ContentType: "image/jpeg" }),
  );
  fs.unlink(localTempPath, () => {});
  return { storageKey: key };
}

/**
 * Returns a short-lived signed URL for viewing an S3-stored photo. For local
 * storage the caller streams the file directly from disk instead (see
 * documentation.routes.ts) since there's no separate object store to sign a
 * URL against.
 */
export async function getJobPhotoSignedUrl(storageKey: string): Promise<string> {
  return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: env.s3Bucket, Key: storageKey }), {
    expiresIn: 900,
  });
}

export function isCloudStorageConfigured(): boolean {
  return isS3Configured;
}

export { localUploadDir, localPhotoUploadDir };
