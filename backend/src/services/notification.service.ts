import twilio from "twilio";
import sgMail from "@sendgrid/mail";
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

export async function sendInvoiceSms(params: { to: string; invoiceNumber: string; paymentUrl: string }) {
  const client = getTwilioClient();
  return client.messages.create({
    to: params.to,
    from: env.twilioFromNumber,
    body: `Your invoice ${params.invoiceNumber} is ready. Pay here: ${params.paymentUrl}`,
  });
}

export async function sendInvoiceEmail(params: {
  to: string;
  invoiceNumber: string;
  paymentUrl: string;
  total: number;
}) {
  if (!env.sendgridApiKey) {
    throw new Error("SendGrid API key is not configured");
  }
  sgMail.setApiKey(env.sendgridApiKey);

  return sgMail.send({
    to: params.to,
    from: env.sendgridFromEmail,
    subject: `Invoice ${params.invoiceNumber} — $${params.total.toFixed(2)}`,
    text: `Your invoice ${params.invoiceNumber} for $${params.total.toFixed(2)} is ready.\n\nPay here: ${params.paymentUrl}`,
    html: `<p>Your invoice <strong>${params.invoiceNumber}</strong> for <strong>$${params.total.toFixed(
      2,
    )}</strong> is ready.</p><p><a href="${params.paymentUrl}">Click here to pay</a></p>`,
  });
}

/**
 * Sends the finished invoice to the client over every channel we have
 * a valid contact for, so there's no manual "hit send" step for the tech.
 */
export async function deliverInvoiceToClient(params: {
  clientEmail?: string | null;
  clientPhone?: string | null;
  invoiceNumber: string;
  paymentUrl: string;
  total: number;
}) {
  const results: { channel: "SMS" | "EMAIL"; recipient: string; success: boolean; error?: string }[] = [];

  if (params.clientPhone) {
    try {
      await sendInvoiceSms({ to: params.clientPhone, invoiceNumber: params.invoiceNumber, paymentUrl: params.paymentUrl });
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
      await sendInvoiceEmail({
        to: params.clientEmail,
        invoiceNumber: params.invoiceNumber,
        paymentUrl: params.paymentUrl,
        total: params.total,
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
