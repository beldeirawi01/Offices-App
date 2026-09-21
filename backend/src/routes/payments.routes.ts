import { Router } from "express";
import { prisma } from "../db/prisma";
import { verifyStripeWebhook } from "../services/payment.service";

export const paymentsRouter = Router();

// Stripe requires the raw body for signature verification; this route is
// mounted with express.raw() in index.ts (before the global JSON parser).
paymentsRouter.post("/webhook", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    return res.status(400).send("Missing Stripe-Signature header");
  }

  let event;
  try {
    event = verifyStripeWebhook(req.body, signature);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return res.status(400).send("Webhook signature verification failed");
  }

  if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
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

    // Stripe retries webhook delivery on any non-2xx/timeout response, so guard
    // against processing the same payment twice and double-inserting a Payment row.
    if (invoiceId && paymentIntentId) {
      const alreadyProcessed = await prisma.payment.findFirst({
        where: { invoiceId, stripePaymentIntentId: paymentIntentId },
      });
      if (!alreadyProcessed) {
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
    }
  }

  res.json({ received: true });
});
