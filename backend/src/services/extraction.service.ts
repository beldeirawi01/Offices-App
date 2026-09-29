import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "../config/env";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!client) {
    // Timeout so a slow/hung request fails the voice note instead of hanging
    // it forever, and let the SDK retry transient network/5xx errors with
    // backoff rather than failing the whole job on one blip.
    client = new Anthropic({ apiKey: env.anthropicApiKey, timeout: 60_000, maxRetries: 3 });
  }
  return client;
}

/**
 * Thrown when Claude's response can't be parsed as JSON or fails schema
 * validation (e.g. a hallucinated negative price). Carries the raw model
 * text so a bad extraction can be debugged instead of just logging "invalid".
 */
export class ExtractionValidationError extends Error {
  constructor(message: string, public readonly rawOutput: string) {
    super(message);
    this.name = "ExtractionValidationError";
  }
}

export const extractedLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().nonnegative().default(1),
  unitPrice: z.number().nonnegative().default(0),
  kind: z.enum(["PART", "LABOR"]).default("PART"),
});

export const extractedJobSchema = z.object({
  customerName: z.string().nullable(),
  jobType: z.string().nullable(),
  summary: z.string(),
  laborHours: z.number().nonnegative().nullable(),
  laborRate: z.number().nonnegative().nullable(),
  lineItems: z.array(extractedLineItemSchema).default([]),
  notes: z.string().nullable(),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

const SYSTEM_PROMPT = `You extract structured billing data from a field technician's spoken job report.
Return ONLY valid JSON matching this exact shape, with no markdown fences and no commentary:

{
  "customerName": string | null,
  "jobType": string | null,
  "summary": string,
  "laborHours": number | null,
  "laborRate": number | null,
  "lineItems": [
    { "description": string, "quantity": number, "unitPrice": number, "kind": "PART" | "LABOR" }
  ],
  "notes": string | null
}

Rules:
- Only include a lineItem for parts/materials/labor actually mentioned.
- Report labor in exactly one place, never both: either laborHours + laborRate (when an hourly rate is mentioned), OR a single "kind": "LABOR" lineItem (when a flat/itemized labor cost is mentioned instead) — never populate laborHours/laborRate AND also add a separate LABOR lineItem for the same work, since that would bill the client twice for the same labor.
- Infer quantity/unitPrice from context; default quantity to 1 if unclear.
- laborHours and laborRate should be null if labor is instead captured as a lineItem (and vice versa).
- Keep "summary" to 1-3 sentences describing the work performed, written for a client-facing invoice.
- Never invent a customer name, part, or price that wasn't mentioned or clearly implied.`;

// Same shape as an invoice extraction, but the tech is speaking BEFORE doing
// the work — an on-arrival estimate, not a record of what was actually done.
const QUOTE_SYSTEM_PROMPT = `You extract structured estimate data from a field technician's spoken on-site assessment, given BEFORE any work is performed.
Return ONLY valid JSON matching this exact shape, with no markdown fences and no commentary:

{
  "customerName": string | null,
  "jobType": string | null,
  "summary": string,
  "laborHours": number | null,
  "laborRate": number | null,
  "lineItems": [
    { "description": string, "quantity": number, "unitPrice": number, "kind": "PART" | "LABOR" }
  ],
  "notes": string | null
}

Rules:
- This is a pre-job ESTIMATE, not actuals — the tech is giving approximate pricing for work not yet done. Round numbers and rough estimates ("about 2 hours", "roughly $280") are expected and should be used as given.
- Only include a lineItem for parts/materials/labor actually mentioned.
- Report labor in exactly one place, never both: either laborHours + laborRate, OR a single "kind": "LABOR" lineItem — never both for the same work.
- Infer quantity/unitPrice from context; default quantity to 1 if unclear.
- Keep "summary" to 1-3 sentences describing the proposed work, written for a client-facing quote.
- Never invent a customer name, part, or price that wasn't mentioned or clearly implied.`;

export interface ExtractionResult {
  result: ExtractedJob;
  // Claude's raw text response, before JSON parsing/validation — kept so a
  // bad extraction (malformed JSON, a rejected hallucinated price) can be
  // debugged from what the model actually said, not just an error string.
  raw: string;
}

async function runExtraction(transcript: string, systemPrompt: string): Promise<ExtractionResult> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: env.anthropicModel,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: transcript }],
  });

  if (message.stop_reason === "max_tokens") {
    throw new Error("Claude's response was truncated (hit max_tokens) before completing the JSON");
  }

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  const raw = textBlock.text;

  let parsed: unknown;
  try {
    const jsonText = extractJsonFromText(raw);
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new ExtractionValidationError(
      `Claude's response wasn't valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw,
    );
  }

  const validation = extractedJobSchema.safeParse(parsed);
  if (!validation.success) {
    throw new ExtractionValidationError(`Claude's response failed validation: ${validation.error.message}`, raw);
  }

  return { result: validation.data, raw };
}

/**
 * Sends a raw transcript to Claude and gets back clean, structured
 * billing data the backend can turn directly into an invoice draft.
 */
export async function extractJobDetails(transcript: string): Promise<ExtractionResult> {
  return runExtraction(transcript, SYSTEM_PROMPT);
}

/**
 * Same shape, but for a pre-job estimate spoken on arrival — used to draft a
 * quote rather than an invoice.
 */
export async function extractQuoteDetails(transcript: string): Promise<ExtractionResult> {
  return runExtraction(transcript, QUOTE_SYSTEM_PROMPT);
}

export function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in Claude response");
  }
  return trimmed.slice(start, end + 1);
}
