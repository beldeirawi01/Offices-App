import cron from "node-cron";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { sendInvoiceReminder, sendRebookingReminder, sendReviewRequest } from "./notification.service";

const REMINDER_INTERVAL_DAYS = 3;

/**
 * Flips SENT invoices past their due date to OVERDUE. Runs hourly so the
 * dashboard's "outstanding" numbers and the tech's job list reflect reality
 * without anyone having to manually mark something late.
 */
async function markOverdueInvoices() {
  const now = new Date();
  const { count } = await prisma.invoice.updateMany({
    where: { status: "SENT", dueDate: { lt: now } },
    data: { status: "OVERDUE" },
  });
  if (count > 0) console.log(`[scheduler] Marked ${count} invoice(s) overdue`);
}

/**
 * Sends a payment reminder for each overdue invoice that hasn't had one in
 * the last REMINDER_INTERVAL_DAYS, so clients get nudged automatically
 * instead of the owner having to chase payments by hand.
 */
async function sendOverdueReminders() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: "OVERDUE",
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }],
    },
    include: { client: true, organization: true },
  });

  for (const invoice of overdueInvoices) {
    const daysOverdue = invoice.dueDate
      ? Math.max(1, Math.floor((now.getTime() - invoice.dueDate.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    try {
      await sendInvoiceReminder({
        clientEmail: invoice.client.email,
        clientPhone: invoice.client.phone,
        clientSmsConsent: invoice.client.smsConsent,
        invoiceNumber: invoice.invoiceNumber,
        pageUrl: `${env.appBaseUrl}/pay/${invoice.publicToken}`,
        total: invoice.total,
        daysOverdue,
        businessName: invoice.organization.name,
      });
      await prisma.invoice.update({ where: { id: invoice.id }, data: { lastReminderAt: now } });
    } catch (err) {
      console.error(`[scheduler] Failed to send reminder for invoice ${invoice.id}`, err);
    }
  }

  if (overdueInvoices.length > 0) {
    console.log(`[scheduler] Sent ${overdueInvoices.length} overdue reminder(s)`);
  }
}

/**
 * Sends a review request for each PAID invoice whose org has review requests
 * enabled, the client hasn't opted out of, and whose configured delay has
 * elapsed since payment. Requires the org to have set a review link — with
 * none configured there's nowhere to send the client, so it's skipped.
 */
async function sendReviewRequests() {
  const now = new Date();

  const candidates = await prisma.invoice.findMany({
    where: {
      status: "PAID",
      reviewRequestSentAt: null,
      paidAt: { not: null },
      organization: { reviewRequestEnabled: true, reviewLinkUrl: { not: null } },
      client: { followUpsEnabled: true },
    },
    include: { client: true, organization: true },
  });

  let sent = 0;
  for (const invoice of candidates) {
    if (!invoice.paidAt || !invoice.organization.reviewLinkUrl) continue;
    const dueAt = new Date(invoice.paidAt.getTime() + invoice.organization.reviewRequestDelayDays * 24 * 60 * 60 * 1000);
    if (dueAt > now) continue;

    try {
      await sendReviewRequest({
        clientEmail: invoice.client.email,
        clientPhone: invoice.client.phone,
        clientSmsConsent: invoice.client.smsConsent,
        reviewLinkUrl: invoice.organization.reviewLinkUrl,
        businessName: invoice.organization.name,
      });
      await prisma.invoice.update({ where: { id: invoice.id }, data: { reviewRequestSentAt: now } });
      sent += 1;
    } catch (err) {
      console.error(`[scheduler] Failed to send review request for invoice ${invoice.id}`, err);
    }
  }

  if (sent > 0) console.log(`[scheduler] Sent ${sent} review request(s)`);
}

/**
 * Nudges clients to rebook a recurring job type once its typical interval
 * has passed since completion. The interval is set per-job (e.g. 6 months
 * for an HVAC tune-up), so candidates are filtered in application code
 * rather than a single SQL cutoff.
 */
async function sendRebookingReminders() {
  const now = new Date();

  const candidates = await prisma.job.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { not: null },
      recurrenceIntervalMonths: { not: null },
      rebookingReminderSentAt: null,
      organization: { rebookingRemindersEnabled: true },
      client: { followUpsEnabled: true },
    },
    include: { client: true, organization: true },
  });

  let sent = 0;
  for (const job of candidates) {
    if (!job.completedAt || !job.recurrenceIntervalMonths) continue;
    const dueAt = new Date(job.completedAt);
    dueAt.setMonth(dueAt.getMonth() + job.recurrenceIntervalMonths);
    if (dueAt > now) continue;

    try {
      await sendRebookingReminder({
        clientEmail: job.client.email,
        clientPhone: job.client.phone,
        clientSmsConsent: job.client.smsConsent,
        jobTitle: job.title,
        businessName: job.organization.name,
      });
      await prisma.job.update({ where: { id: job.id }, data: { rebookingReminderSentAt: now } });
      sent += 1;
    } catch (err) {
      console.error(`[scheduler] Failed to send rebooking reminder for job ${job.id}`, err);
    }
  }

  if (sent > 0) console.log(`[scheduler] Sent ${sent} rebooking reminder(s)`);
}

/**
 * Starts the background jobs. Skipped automatically if Twilio/Brevo
 * aren't configured for reminders — overdue marking still runs regardless,
 * since it's just a status flip with no external dependency.
 */
export function startScheduledJobs() {
  // Every hour: recompute which sent invoices have gone overdue.
  cron.schedule("0 * * * *", () => {
    markOverdueInvoices().catch((err) => console.error("[scheduler] markOverdueInvoices failed", err));
  });

  // Twice daily: nudge clients on invoices that are still overdue.
  cron.schedule("0 9,17 * * *", () => {
    sendOverdueReminders().catch((err) => console.error("[scheduler] sendOverdueReminders failed", err));
  });

  // Once daily: ask recently-paid clients for a review.
  cron.schedule("0 10 * * *", () => {
    sendReviewRequests().catch((err) => console.error("[scheduler] sendReviewRequests failed", err));
  });

  // Once daily: nudge clients whose recurring job type is due for a rebooking.
  cron.schedule("0 11 * * *", () => {
    sendRebookingReminders().catch((err) => console.error("[scheduler] sendRebookingReminders failed", err));
  });

  console.log("[scheduler] Overdue detection, reminder, review request, and rebooking jobs scheduled");
}

// Exported for the test suite and for manual/CLI triggering.
export { markOverdueInvoices, sendOverdueReminders, sendReviewRequests, sendRebookingReminders };
