import fs from "fs";
import OpenAI from "openai";
import { env } from "../config/env";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.openaiApiKey });
  }
  return client;
}

/**
 * Transcribes a field-recorded voice note using Whisper.
 * Tuned with a domain prompt so trade-specific terms (part names, brands)
 * are transcribed more reliably in noisy on-site conditions.
 */
export async function transcribeAudio(filePath: string): Promise<string> {
  const openai = getClient();

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
    prompt:
      "This is a voice note from a field technician (HVAC, plumbing, or electrical) describing a completed job: customer name, work performed, time spent, parts used, and cost.",
    response_format: "json",
  });

  return transcription.text;
}
