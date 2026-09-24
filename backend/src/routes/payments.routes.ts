import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "../db/prisma";
import { verifyStripeWebhook, verifyStripeConnectWebhook } from "../services/payment.service";

export const paymentsRouter = Router();

/**
 * Shared by both webhook endpoints below. `event.account` is only present
 * on events delivered to the Connect-scoped endpoint (a payment made on one
 * of our connected accounts) — when present, we double-check it actually
 * matches the invoice's own organization before trusting it, since Stripe
 * guarantees the field but a mismatch here would mean a real bug elsewhere.
 */
async function processStripeEvent(event: Stripe.Event) {
  if (event.type !== "checkout.session.completed" && event.type !== "payment_intent.succeeded") {
    return;
  }

  const object = event.data.object as {
    id: string;
    metadata?: Record<string, string>;
    amount_total?: number;
    amount?: number;
    payment_intent?: string | { id: string } | null;
  };
  const invoiceId = object.metadata?.invoiceId;
  const paymentIntentId =
    event.type === "payment_intent.succeeded"
      ? object.id
      : typeof object.payment_intent === "string"
        ? object.payment_intent
        : object.payment_intent?.id;

  if (!invoiceId || !paymentIntentId) return;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { organization: true },
  });
  if (!invoice) {
    console.error(`Stripe webhook referenced unknown invoice ${invoiceId}`);
    return;
  }
  if (event.account && invoice.organization.stripeAccountId !== event.account) {
    console.error(
      `Stripe webhook account mismatch for invoice ${invoiceId}: event.account=${event.account}, expected=${invoice.organization.stripeAccountId}`,
    );
    return;
  }

  // Stripe retries webhook delivery on any non-2xx/timeout response, so guard
  // against processing the same payment twice and double-inserting a Payment row.
  const alreadyProcessed = await prisma.payment.findFirst({
    where: { invoiceId, stripePaymentIntentId: paymentIntentId },
  });
  if (alreadyProcessed) return;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "PAID", paidAt: new Date() },
  });
  await prisma.payment.create({
    data: {
      invoiceId,
      amount: (object.amount_total ?? object.amount ?? 0) / 100,
      status: "SUCCEEDED",
      stripePaymentIntentId: paymentIntentId,
    },
  });
}

// Stripe requires the raw body for signature verification; this route is
// mounted with express.raw() in index.ts (before the global JSON parser).
paymentsRouter.post("/webhook", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    return res.status(400).send("Missing Stripe-Signature header");
  }

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(req.body, signature);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return res.status(400).send("Webhook signature verification failed");
  }

  await processStripeEvent(event);
  res.json({ received: true });
});

// Separate endpoint for events Stripe sends on behalf of connected accounts
// (client payments on a business's own Stripe account). Register this URL
// as its own webhook endpoint in the Stripe Dashboard scoped to "connected
// accounts" — it gets its own signing secret (STRIPE_CONNECT_WEBHOOK_SECRET),
// distinct from the platform-account webhook above.
paymentsRouter.post("/connect-webhook", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    return res.status(400).send("Missing Stripe-Signature header");
  }

  let event: Stripe.Event;
  try {
    event = verifyStripeConnectWebhook(req.body, signature);
  } catch (err) {
    console.error("Stripe Connect webhook signature verification failed", err);
    return res.status(400).send("Webhook signature verification failed");
  }

  await processStripeEvent(event);
  res.json({ received: true });
});
