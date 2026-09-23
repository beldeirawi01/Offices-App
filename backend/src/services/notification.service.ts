import twilio from "twilio";
import { env } from "../config/env";

let twilioClient: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (!env.twilioAccountSid || !env.twilioAuthToken) {
    throw new Error("Twilio credentials are not configured");
  }
  if (!twilioClient) {
    twilioClient = twilio(env.twilioAccountSid, env.twilioAuthToken);
  }
  return twilioClient;
}

// Twilio's carrier-level opt-out (replying STOP) is handled automatically for
// numbers registered on a Messaging Service — no code-side handling needed,
// but you must complete A2P 10DLC/toll-free registration before sending at
// volume, and every message must be sent to a client with smsConsent=true.
export async function sendSms(params: { to: string; body: string }) {
  const client = getTwilioClient();
  return client.messages.create({ to: params.to, from: env.twilioFromNumber, body: params.body });
}

export async function sendEmail(params: { to: string; subject: string; text: string; html: string }) {
  if (!env.brevoApiKey) {
    throw new Error("Brevo API key is not configured");
  }
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.brevoApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: env.brevoFromEmail },
      to: [{ email: params.to }],
      subject: params.subject,
      textContent: params.text,
      htmlContent: params.html,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo email send failed (${response.status}): ${body}`);
  }
  return response.json();
}

type DeliveryResult = { channel: "SMS" | "EMAIL"; recipient: string; success: boolean; error?: string };

/**
 * Sends the finished invoice to the client over every channel we have a
 * valid, consented contact for, so there's no manual "hit send" step for the
 * tech. Links to the branded public invoice page rather than a raw Stripe
 * checkout link, so the client sees your business name before paying.
 */
export async function deliverInvoiceToClient(params: {
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientSmsConsent: boolean;
  invoiceNumber: string;
  pageUrl: string;
  total: number;
}): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  if (params.clientPhone && params.clientSmsConsent) {
    try {
      await sendSms({
        to: params.clientPhone,
        body: `Your invoice ${params.invoiceNumber} for $${params.total.toFixed(2)} is ready: ${params.pageUrl}`,
      });
      results.push({ channel: "SMS", recipient: params.clientPhone, success: true });
    } catch (err) {
      results.push({
        channel: "SMS",
        recipient: params.clientPhone,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (params.clientEmail) {
    try {
      await sendEmail({
        to: params.clientEmail,
        subject: `Invoice ${params.invoiceNumber} — $${params.total.toFixed(2)}`,
        text: `Your invoice ${params.invoiceNumber} for $${params.total.toFixed(2)} is ready.\n\nView and pay: ${params.pageUrl}`,
        html: `<p>Your invoice <strong>${params.invoiceNumber}</strong> for <strong>$${params.total.toFixed(2)}</strong> is ready.</p><p><a href="${params.pageUrl}">View invoice and pay</a></p>`,
      });
      results.push({ channel: "EMAIL", recipient: params.clientEmail, success: true });
    } catch (err) {
      results.push({
        channel: "EMAIL",
        recipient: params.clientEmail,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}

/** Sends a payment reminder for an overdue invoice, same channel rules as delivery. */
export async function sendInvoiceReminder(params: {
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientSmsConsent: boolean;
  invoiceNumber: string;
  pageUrl: string;
  total: number;
  daysOverdue: number;
}): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  if (params.clientPhone && params.clientSmsConsent) {
    try {
      await sendSms({
        to: params.clientPhone,
        body: `Reminder: invoice ${params.invoiceNumber} for $${params.total.toFixed(2)} is ${params.daysOverdue} day(s) overdue. Pay here: ${params.pageUrl}`,
      });
      results.push({ channel: "SMS", recipient: params.clientPhone, success: true });
    } catch (err) {
      results.push({ channel: "SMS", recipient: params.clientPhone, success: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  if (params.clientEmail) {
    try {
      await sendEmail({
        to: params.clientEmail,
        subject: `Reminder: Invoice ${params.invoiceNumber} is overdue`,
        text: `This is a reminder that invoice ${params.invoiceNumber} for $${params.total.toFixed(2)} is ${params.daysOverdue} day(s) overdue.\n\nView and pay: ${params.pageUrl}`,
        html: `<p>This is a reminder that invoice <strong>${params.invoiceNumber}</strong> for <strong>$${params.total.toFixed(2)}</strong> is <strong>${params.daysOverdue} day(s) overdue</strong>.</p><p><a href="${params.pageUrl}">View invoice and pay</a></p>`,
      });
      results.push({ channel: "EMAIL", recipient: params.clientEmail, success: true });
    } catch (err) {
      results.push({ channel: "EMAIL", recipient: params.clientEmail, success: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return results;
}
