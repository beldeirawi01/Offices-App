import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";

// Jobs are often recorded somewhere with no signal (a basement, a rural
// property, a metal-walled shop) — a recording or a documentation photo
// captured there must never be lost just because the upload can't go out
// yet. Everything is copied into permanent app storage immediately, queued
// in AsyncStorage, and retried on reconnect/app-foreground rather than
// living only in a temp URI that expo-av/expo-image-picker may clear.

const QUEUE_DIR = `${FileSystem.documentDirectory}upload-queue/`;
const QUEUE_KEY = "uploadQueue";

type QueueItemBase = {
  id: string;
  jobId: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
};

export type VoiceNoteQueueItem = QueueItemBase & {
  kind: "voice-note";
  purpose: "QUOTE" | "INVOICE";
  audioPath: string;
};

export type DocumentationQueueItem = QueueItemBase & {
  kind: "documentation";
  stage: "ARRIVAL" | "MID_JOB" | "COMPLETION";
  photoPath: string;
  audioPath: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type QueueItem = VoiceNoteQueueItem | DocumentationQueueItem;

async function ensureQueueDir() {
  const info = await FileSystem.getInfoAsync(QUEUE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
  }
}

async function readQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueueItem[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  notifyListeners(items);
}

// Every read-modify-write against the queue goes through this so an enqueue
// racing a background retry (e.g. a tech saves a new recording right as the
// app comes back online and starts retrying an older one) can't clobber each
// other's change with a stale read — a real risk with two independent
// AsyncStorage read+write pairs and no other locking primitive available in
// a single JS thread.
let mutationChain: Promise<unknown> = Promise.resolve();
function withQueueLock<T>(fn: (queue: QueueItem[]) => Promise<T>): Promise<T> {
  const run = mutationChain.then(async () => {
    const queue = await readQueue();
    return fn(queue);
  });
  mutationChain = run.catch(() => undefined);
  return run;
}

// Minimal pub-sub so a screen can show "N pending" without polling.
type Listener = (items: QueueItem[]) => void;
const listeners = new Set<Listener>();
function notifyListeners(items: QueueItem[]) {
  listeners.forEach((l) => l(items));
}
export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  readQueue().then(listener);
  return () => listeners.delete(listener);
}

async function copyIntoQueueDir(sourceUri: string, filename: string): Promise<string> {
  await ensureQueueDir();
  const dest = `${QUEUE_DIR}${filename}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

function newId(): string {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/** True only for a request that never reached the server (offline/timeout) — worth retrying. A real server response (4xx/5xx) means retrying the same bytes won't help. */
function isConnectivityError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "request" in err && !(err as { response?: unknown }).response);
}

export interface EnqueueResult {
  queued: boolean;
  // Present only when uploaded immediately (not queued).
  voiceNoteId?: string;
}

/**
 * Copies the recording into permanent storage and queues it, then makes one
 * immediate upload attempt (the common case: you have signal). Returns
 * whether it actually went out now or is waiting for connectivity.
 */
export async function enqueueVoiceNote(params: {
  jobId: string;
  purpose: "QUOTE" | "INVOICE";
  audioUri: string;
}): Promise<EnqueueResult> {
  const id = newId();
  const audioPath = await copyIntoQueueDir(params.audioUri, `${id}-audio.m4a`);
  const item: VoiceNoteQueueItem = {
    id,
    kind: "voice-note",
    jobId: params.jobId,
    purpose: params.purpose,
    audioPath,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  await withQueueLock((queue) => writeQueue([...queue, item]));

  const result = await attemptUpload(item);
  if (result.ok) {
    return { queued: false, voiceNoteId: result.voiceNoteId };
  }
  if (!result.retryable) {
    // A genuine server rejection (bad file, auth, subscription) — surface it
    // now rather than silently queuing something that can never succeed.
    await removeItem(id);
    throw result.error;
  }
  return { queued: true };
}

export async function enqueueDocumentation(params: {
  jobId: string;
  stage: "ARRIVAL" | "MID_JOB" | "COMPLETION";
  photoUri: string;
  audioUri: string | null;
  latitude: number | null;
  longitude: number | null;
}): Promise<EnqueueResult> {
  const id = newId();
  const photoPath = await copyIntoQueueDir(params.photoUri, `${id}-photo.jpg`);
  const audioPath = params.audioUri ? await copyIntoQueueDir(params.audioUri, `${id}-audio.m4a`) : null;
  const item: DocumentationQueueItem = {
    id,
    kind: "documentation",
    jobId: params.jobId,
    stage: params.stage,
    photoPath,
    audioPath,
    latitude: params.latitude,
    longitude: params.longitude,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  await withQueueLock((queue) => writeQueue([...queue, item]));

  const result = await attemptUpload(item);
  if (result.ok) return { queued: false };
  if (!result.retryable) {
    await removeItem(id);
    throw result.error;
  }
  return { queued: true };
}

async function removeItem(id: string) {
  await withQueueLock(async (queue) => {
    const item = queue.find((i) => i.id === id);
    if (item) {
      const paths = item.kind === "voice-note" ? [item.audioPath] : [item.photoPath, item.audioPath].filter(Boolean);
      await Promise.all((paths as string[]).map((p) => FileSystem.deleteAsync(p, { idempotent: true })));
    }
    await writeQueue(queue.filter((i) => i.id !== id));
  });
}

type UploadOutcome =
  | { ok: true; voiceNoteId?: string }
  | { ok: false; retryable: true }
  | { ok: false; retryable: false; error: unknown };

async function attemptUpload(item: QueueItem): Promise<UploadOutcome> {
  try {
    if (item.kind === "voice-note") {
      const formData = new FormData();
      formData.append("audio", { uri: item.audioPath, name: "job-note.m4a", type: "audio/m4a" } as any);
      formData.append("purpose", item.purpose);
      const { data } = await api.post(`/jobs/${item.jobId}/voice-notes`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await removeItem(item.id);
      return { ok: true, voiceNoteId: data.voiceNoteId };
    }

    const formData = new FormData();
    formData.append("stage", item.stage);
    if (item.latitude != null && item.longitude != null) {
      formData.append("latitude", String(item.latitude));
      formData.append("longitude", String(item.longitude));
    }
    formData.append("photo", { uri: item.photoPath, name: "documentation.jpg", type: "image/jpeg" } as any);
    if (item.audioPath) {
      formData.append("audio", { uri: item.audioPath, name: "documentation.m4a", type: "audio/m4a" } as any);
    }
    await api.post(`/jobs/${item.jobId}/documentation`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    await removeItem(item.id);
    return { ok: true };
  } catch (err) {
    if (isConnectivityError(err)) {
      await withQueueLock((queue) =>
        writeQueue(
          queue.map((i) =>
            i.id === item.id
              ? { ...i, attempts: i.attempts + 1, lastAttemptAt: new Date().toISOString(), lastError: "No connection" }
              : i,
          ),
        ),
      );
      return { ok: false, retryable: true };
    }
    return { ok: false, retryable: false, error: err };
  }
}

// Avoid two triggers (e.g. reconnect + foreground firing together) racing
// through the same queued items twice.
let processing = false;

/** Retries every queued item, oldest first, stopping at the first connectivity failure (no point hammering the rest). */
export async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const queue = await readQueue();
    for (const item of queue) {
      const result = await attemptUpload(item);
      if (!result.ok && result.retryable) break; // still offline — stop for this pass
      // A non-retryable failure here means a previously-queued item now
      // fails validation server-side (rare) — drop it rather than retrying
      // forever; there's no UI mid-queue to surface the error to.
      if (!result.ok && !result.retryable) await removeItem(item.id);
    }
  } finally {
    processing = false;
  }
}

