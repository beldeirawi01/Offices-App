import Stripe from "stripe";
import { env } from "../config/env";

let client: Stripe | null = null;

function getClient(): Stripe {
  if (!env.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!client) {
    client = new Stripe(env.stripeSecretKey);
  }
  return client;
}

/**
 * Creates a one-off Stripe Payment Link for an invoice total so the
 * client can pay with a single tap from the SMS/email they receive.
 */
export async function createPaymentLinkForInvoice(params: {
  invoiceId: string;
  invoiceNumber: string;
  totalCents: number;
}): Promise<{ id: string; url: string }> {
  const stripe = getClient();

  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: params.totalCents,
    product_data: {
      name: `Invoice ${params.invoiceNumber}`,
    },
  });

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { invoiceId: params.invoiceId },
    after_completion: {
      type: "redirect",
      redirect: { url: `${env.appBaseUrl}/invoices/${params.invoiceId}?paid=1` },
    },
  });

  return { id: link.id, url: link.url };
}

export function verifyStripeWebhook(rawBody: Buffer, signature: string): Stripe.Event {
  const stripe = getClient();
  return stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
}
