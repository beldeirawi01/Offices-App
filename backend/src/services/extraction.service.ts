import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "../config/env";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

export const extractedLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  kind: z.enum(["PART", "LABOR"]).default("PART"),
});

export const extractedJobSchema = z.object({
  customerName: z.string().nullable(),
  jobType: z.string().nullable(),
  summary: z.string(),
  laborHours: z.number().nullable(),
  laborRate: z.number().nullable(),
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
- If a dollar cost is mentioned for the whole job but not itemized, put it as a single line item with kind "LABOR" and description "Labor / service call".
- Infer quantity/unitPrice from context; default quantity to 1 if unclear.
- laborHours and laborRate should be null if not mentioned.
- Keep "summary" to 1-3 sentences describing the work performed, written for a client-facing invoice.
- Never invent a customer name, part, or price that wasn't mentioned or clearly implied.`;

/**
 * Sends a raw transcript to Claude and gets back clean, structured
 * billing data the backend can turn directly into an invoice draft.
 */
export async function extractJobDetails(transcript: string): Promise<ExtractedJob> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: env.anthropicModel,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const jsonText = extractJsonFromText(textBlock.text);
  const parsed = JSON.parse(jsonText);
  return extractedJobSchema.parse(parsed);
}

function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in Claude response");
  }
  return trimmed.slice(start, end + 1);
}
