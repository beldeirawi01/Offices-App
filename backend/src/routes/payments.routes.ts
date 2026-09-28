import { Router } from "express";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { verifyStripeWebhook, verifyStripeConnectWebhook, mapStripeSubscriptionStatus } from "../services/payment.service";

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const paymentsRouter = Router();

/**
 * Keeps an org's billing status in sync with its Stripe Subscription. Fires
 * on creation and every status change (trial ending, a failed charge moving
 * it to past_due, cancellation, etc). Guards against a stale/mismatched
 * subscription id ever overwriting a newer one for the same org.
 */
async function handleSubscriptionStatusChange(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organizationId;
  if (!organizationId) return;

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return;
  if (org.stripeSubscriptionId && org.stripeSubscriptionId !== subscription.id) {
    console.error(`Stripe subscription id mismatch for org ${organizationId}: expected=${org.stripeSubscriptionId}, got=${subscription.id}`);
    return;
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      subscriptionStatus: mapStripeSubscriptionStatus(subscription.status),
      subscriptionCurrentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
    },
  });
}

/**
 * Shared by both webhook endpoints below. Claims the event id first (atomic
 * insert into StripeWebhookEvent) so a redelivery — Stripe retries on any
 * non-2xx/timeout, and the platform + Connect streams are independent, so
 * either can redeliver — is skipped instead of reapplied. If the actual
 * handling below throws, the claim is released so a genuine retry (as
 * opposed to a duplicate) still gets processed rather than silently dropped.
 */
async function processStripeEvent(event: Stripe.Event) {
  try {
    await prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      console.log(`Stripe event ${event.id} (${event.type}) already processed, skipping`);
      return;
    }
    throw err;
  }

  try {
    await applyStripeEvent(event);
  } catch (err) {
    await prisma.stripeWebhookEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw err;
  }
}

/**
 * `event.account` is only present on events delivered to the Connect-scoped
 * endpoint (a payment made on one of our connected accounts) — when present,
 * we double-check it actually matches the invoice's own organization before
 * trusting it, since Stripe guarantees the field but a mismatch here would
 * mean a real bug elsewhere.
 */
async function applyStripeEvent(event: Stripe.Event) {
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    return handleSubscriptionStatusChange(event.data.object as Stripe.Subscription);
  }

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
