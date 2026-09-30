import twilio from "twilio";
import { Prisma } from "@prisma/client";
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

// Twilio's carrier-level opt-out (replying STOP) blocks delivery
// automatically for numbers on a Messaging Service, but doesn't update our
// own Client.smsConsent — see routes/twilio.routes.ts for the inbound
// webhook that keeps that in sync. You must also complete A2P 10DLC/
// toll-free registration before sending at volume, and every message must
// be sent to a client with smsConsent=true.
export async function sendSms(params: { to: string; body: string }) {
  const client = getTwilioClient();
  return client.messages.create({ to: params.to, from: env.twilioFromNumber, body: params.body });
}

export async function sendEmail(params: { to: string; subject: string; text: string; html: string; fromName?: string }) {
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
      // The from address is always our one verified Brevo sender; the display
      // name is set per-send to the tenant's own business name so clients see
      // "Mike's HVAC" rather than a generic platform name in their inbox.
      sender: { email: env.brevoFromEmail, name: params.fromName ?? "Jobscribe" },
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
  total: Prisma.Decimal;
  businessName: string;
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
        fromName: params.businessName,
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

/**
 * Sends a drafted quote to the client for approval — same channel rules as
 * invoice delivery, but pointing at the public quote page (accept/decline)
 * rather than a payment link.
 */
export async function deliverQuoteToClient(params: {
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientSmsConsent: boolean;
  quoteNumber: string;
  pageUrl: string;
  total: Prisma.Decimal;
  businessName: string;
}): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  if (params.clientPhone && params.clientSmsConsent) {
    try {
      await sendSms({
        to: params.clientPhone,
        body: `Your quote ${params.quoteNumber} for $${params.total.toFixed(2)} is ready to review: ${params.pageUrl}`,
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
        fromName: params.businessName,
        subject: `Quote ${params.quoteNumber} — $${params.total.toFixed(2)}`,
        text: `Your quote ${params.quoteNumber} for $${params.total.toFixed(2)} is ready to review.\n\nView and respond: ${params.pageUrl}`,
        html: `<p>Your quote <strong>${params.quoteNumber}</strong> for <strong>$${params.total.toFixed(2)}</strong> is ready to review.</p><p><a href="${params.pageUrl}">View quote</a></p>`,
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

/**
 * Sends a change order to the client for approval — same channel rules as
 * invoice/quote delivery, pointing at the public approve/decline page.
 */
export async function deliverChangeOrderToClient(params: {
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientSmsConsent: boolean;
  jobTitle: string;
  pageUrl: string;
  amount: Prisma.Decimal;
  businessName: string;
}): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  if (params.clientPhone && params.clientSmsConsent) {
    try {
      await sendSms({
        to: params.clientPhone,
        body: `${params.businessName} has a change order for "${params.jobTitle}" (+$${params.amount.toFixed(2)}) that needs your approval: ${params.pageUrl}`,
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
        fromName: params.businessName,
        subject: `Change order for "${params.jobTitle}" — $${params.amount.toFixed(2)}`,
        text: `${params.businessName} has proposed a change order for "${params.jobTitle}" for an additional $${params.amount.toFixed(2)}.\n\nReview and respond: ${params.pageUrl}`,
        html: `<p><strong>${params.businessName}</strong> has proposed a change order for "${params.jobTitle}" for an additional <strong>$${params.amount.toFixed(2)}</strong>.</p><p><a href="${params.pageUrl}">Review and respond</a></p>`,
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
  total: Prisma.Decimal;
  daysOverdue: number;
  businessName: string;
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
        fromName: params.businessName,
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

/**
 * Asks a client for a review some days after their invoice was paid — the
 * moment they're happiest with the work. Points at the org's own review
 * link (e.g. Google Business Profile) rather than anything we host.
 */
export async function sendReviewRequest(params: {
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientSmsConsent: boolean;
  reviewLinkUrl: string;
  businessName: string;
}): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  if (params.clientPhone && params.clientSmsConsent) {
    try {
      await sendSms({
        to: params.clientPhone,
        body: `Thanks for choosing ${params.businessName}! Mind leaving us a quick review? ${params.reviewLinkUrl}`,
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
        fromName: params.businessName,
        subject: `How did we do?`,
        text: `Thanks for choosing ${params.businessName}! Mind leaving us a quick review?\n\n${params.reviewLinkUrl}`,
        html: `<p>Thanks for choosing <strong>${params.businessName}</strong>! Mind leaving us a quick review?</p><p><a href="${params.reviewLinkUrl}">Leave a review</a></p>`,
      });
      results.push({ channel: "EMAIL", recipient: params.clientEmail, success: true });
    } catch (err) {
      results.push({ channel: "EMAIL", recipient: params.clientEmail, success: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return results;
}

/**
 * Nudges a client to rebook once a recurring job type's typical interval
 * (e.g. 6 months for an HVAC tune-up) has passed since it was last done.
 */
export async function sendRebookingReminder(params: {
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientSmsConsent: boolean;
  jobTitle: string;
  businessName: string;
}): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  if (params.clientPhone && params.clientSmsConsent) {
    try {
      await sendSms({
        to: params.clientPhone,
        body: `Hi from ${params.businessName} — it's about time for your next "${params.jobTitle}" service. Ready to book?`,
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
        fromName: params.businessName,
        subject: `Time for your next ${params.jobTitle}?`,
        text: `Hi from ${params.businessName} — it's about time for your next "${params.jobTitle}" service. Ready to book?`,
        html: `<p>Hi from <strong>${params.businessName}</strong> — it's about time for your next "${params.jobTitle}" service. Ready to book?</p>`,
      });
      results.push({ channel: "EMAIL", recipient: params.clientEmail, success: true });
    } catch (err) {
      results.push({ channel: "EMAIL", recipient: params.clientEmail, success: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return results;
}
