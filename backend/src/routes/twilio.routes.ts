import { Router } from "express";
import twilio from "twilio";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

export const twilioRouter = Router();

const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_KEYWORDS = new Set(["start", "yes", "unstop"]);

/**
 * Client phone numbers are stored however the owner typed them (no format
 * enforced at entry), while Twilio's "From" is always E.164. Comparing the
 * last 10 digits matches "(555) 123-4567", "555-123-4567", "+15551234567",
 * etc. against each other for US numbers.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function buildTwiml(message?: string): string {
  const response = new twilio.twiml.MessagingResponse();
  if (message) response.message(message);
  return response.toString();
}

/**
 * All Twilio SMS for every organization goes out from one shared platform
 * number (see notification.service.ts), so a STOP reply is honored for
 * every Client row matching that phone number regardless of which org it
 * belongs to — the carrier blocks the number from this Twilio sender
 * entirely, so leaving another org's copy of the same number marked
 * consented would just be wrong, not merely optimistic.
 */
async function setConsentForPhone(normalizedPhone: string, smsConsent: boolean): Promise<void> {
  const clients = await prisma.client.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } });
  const matchingIds = clients.filter((c) => c.phone && normalizePhone(c.phone) === normalizedPhone).map((c) => c.id);
  if (matchingIds.length > 0) {
    await prisma.client.updateMany({ where: { id: { in: matchingIds } }, data: { smsConsent } });
  }
}

/**
 * Twilio's own carrier-level opt-out (for a number on a Messaging Service)
 * stops delivery automatically, but never tells this app about it — without
 * this webhook, a client who replied STOP would still show as
 * smsConsent=true here, misrepresenting their actual status on the
 * dashboard and leaving the app to keep trying (and silently failing) to
 * text an address that's already blocked. Mounted with its own urlencoded
 * body parser in app.ts, ahead of the global JSON parser, since Twilio
 * POSTs form-encoded — validateRequest needs that exact parsed body.
 */
twilioRouter.post("/sms", async (req, res) => {
  const signature = req.headers["x-twilio-signature"];
  if (typeof signature !== "string" || !env.twilioAuthToken || !env.apiPublicUrl) {
    console.error("Twilio SMS webhook: cannot verify request (missing signature, auth token, or API_PUBLIC_URL)");
    return res.status(400).send("Cannot verify request");
  }

  const url = `${env.apiPublicUrl.replace(/\/+$/, "")}/api/webhooks/twilio/sms`;
  const isValid = twilio.validateRequest(env.twilioAuthToken, signature, url, req.body);
  if (!isValid) {
    console.error("Twilio SMS webhook signature verification failed");
    return res.status(400).send("Invalid signature");
  }

  const from = typeof req.body.From === "string" ? req.body.From : "";
  const body = typeof req.body.Body === "string" ? req.body.Body.trim().toLowerCase() : "";
  const normalizedFrom = normalizePhone(from);

  let replyMessage: string | undefined;
  if (normalizedFrom && STOP_KEYWORDS.has(body)) {
    await setConsentForPhone(normalizedFrom, false);
    replyMessage = "You have been unsubscribed and will not receive further messages. Reply START to resubscribe.";
  } else if (normalizedFrom && START_KEYWORDS.has(body)) {
    await setConsentForPhone(normalizedFrom, true);
    replyMessage = "You are resubscribed and will receive messages again.";
  }

  res.type("text/xml").send(buildTwiml(replyMessage));
});
