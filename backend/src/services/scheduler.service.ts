import cron from "node-cron";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { sendInvoiceReminder } from "./notification.service";

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
    include: { client: true },
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

  console.log("[scheduler] Overdue detection and reminder jobs scheduled");
}

// Exported for the test suite and for manual/CLI triggering.
export { markOverdueInvoices, sendOverdueReminders };
