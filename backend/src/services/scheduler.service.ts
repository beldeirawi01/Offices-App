import cron from "node-cron";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { sendInvoiceReminder, sendRebookingReminder, sendReviewRequest } from "./notification.service";

const REMINDER_INTERVAL_DAYS = 3;

/** The local hour (0-23) it currently is for an org in its own timezone. */
function currentHourInTimezone(date: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(
    date,
  );
  return parseInt(formatted, 10);
}

// Arbitrary distinct keys for Postgres advisory locks, one per send-type
// scheduled job. Only jobs that actually send something to a client need
// one — markOverdueInvoices is a plain idempotent status flip, safe for two
// instances to run concurrently with no duplicate side effect.
const LOCK_KEYS = {
  sendOverdueReminders: 7201,
  sendReviewRequests: 7202,
  sendRebookingReminders: 7203,
} as const;

/**
 * Runs `fn` only if this process can claim `lockKey` for the duration —
 * guards against two backend instances (or an overlapping run that took
 * longer than the cron interval) both sending the same reminder/review
 * request. pg_try_advisory_xact_lock is non-blocking (a losing instance
 * skips this run rather than queuing behind the winner) and automatically
 * released when the transaction ends, so a crashed process can't leak a
 * held lock. Prisma's default 5s transaction timeout is raised since `fn`
 * makes real outbound calls (SMS/email) per candidate, sequentially.
 */
async function withAdvisoryLock(lockKey: number, jobName: string, fn: () => Promise<void>): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${lockKey}) AS locked`;
      if (!rows[0]?.locked) {
        console.log(`[scheduler] ${jobName}: another instance already holds this job's lock, skipping this run`);
        return;
      }
      await fn();
    },
    { timeout: 5 * 60 * 1000 },
  );
}

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

// Local hours (24h) each timezone-aware job is allowed to actually send at.
// The cron trigger itself now runs hourly; these gate which of those hourly
// ticks does anything for a given org, based on that org's own clock.
const OVERDUE_REMINDER_HOURS = [9, 17];
const REVIEW_REQUEST_HOUR = 10;
const REBOOKING_REMINDER_HOUR = 11;

/**
 * Sends a payment reminder for each overdue invoice that hasn't had one in
 * the last REMINDER_INTERVAL_DAYS, so clients get nudged automatically
 * instead of the owner having to chase payments by hand. Only sent when it's
 * currently 9am or 5pm in the invoice's own organization's timezone.
 */
async function sendOverdueRemindersImpl() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: "OVERDUE",
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }],
    },
    include: { client: true, organization: true },
  });

  let sentCount = 0;
  for (const invoice of overdueInvoices) {
    if (!OVERDUE_REMINDER_HOURS.includes(currentHourInTimezone(now, invoice.organization.timezone))) continue;

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
      sentCount += 1;
    } catch (err) {
      console.error(`[scheduler] Failed to send reminder for invoice ${invoice.id}`, err);
    }
  }

  if (sentCount > 0) {
    console.log(`[scheduler] Sent ${sentCount} overdue reminder(s)`);
  }
}

/**
 * Sends a review request for each PAID invoice whose org has review requests
 * enabled, the client hasn't opted out of, and whose configured delay has
 * elapsed since payment. Requires the org to have set a review link — with
 * none configured there's nowhere to send the client, so it's skipped.
 */
async function sendReviewRequestsImpl() {
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
    if (currentHourInTimezone(now, invoice.organization.timezone) !== REVIEW_REQUEST_HOUR) continue;

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
async function sendRebookingRemindersImpl() {
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
    if (currentHourInTimezone(now, job.organization.timezone) !== REBOOKING_REMINDER_HOUR) continue;

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

// Lock-guarded entry points — these are what the cron schedule (and the test
// suite/manual triggering) actually calls, so double-sending is prevented no
// matter who calls them.
async function sendOverdueReminders() {
  await withAdvisoryLock(LOCK_KEYS.sendOverdueReminders, "sendOverdueReminders", sendOverdueRemindersImpl);
}
async function sendReviewRequests() {
  await withAdvisoryLock(LOCK_KEYS.sendReviewRequests, "sendReviewRequests", sendReviewRequestsImpl);
}
async function sendRebookingReminders() {
  await withAdvisoryLock(LOCK_KEYS.sendRebookingReminders, "sendRebookingReminders", sendRebookingRemindersImpl);
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

  // These three tick hourly rather than at a fixed server-clock time — each
  // one internally only acts on candidates for whom it's currently their
  // target local hour (OVERDUE_REMINDER_HOURS/REVIEW_REQUEST_HOUR/
  // REBOOKING_REMINDER_HOUR above), computed from that org's own timezone.
  cron.schedule("0 * * * *", () => {
    sendOverdueReminders().catch((err) => console.error("[scheduler] sendOverdueReminders failed", err));
  });

  cron.schedule("0 * * * *", () => {
    sendReviewRequests().catch((err) => console.error("[scheduler] sendReviewRequests failed", err));
  });

  cron.schedule("0 * * * *", () => {
    sendRebookingReminders().catch((err) => console.error("[scheduler] sendRebookingReminders failed", err));
  });

  console.log("[scheduler] Overdue detection, reminder, review request, and rebooking jobs scheduled");
}

// Exported for the test suite and for manual/CLI triggering.
export { markOverdueInvoices, sendOverdueReminders, sendReviewRequests, sendRebookingReminders, LOCK_KEYS };
