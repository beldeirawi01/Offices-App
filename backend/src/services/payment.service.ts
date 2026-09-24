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
 * Creates a Stripe Express connected account for a business so their client
 * payments settle to their own bank account instead of ours. This is just
 * the account shell — the owner still has to complete Stripe's hosted
 * onboarding (see createOnboardingLink) before it can accept charges.
 */
export async function createConnectedAccount(email: string): Promise<string> {
  const stripe = getClient();
  const account = await stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return account.id;
}

/**
 * A single-use link to Stripe's hosted onboarding (or to resume it, if the
 * owner left partway through) — we never build these forms ourselves.
 */
export async function createOnboardingLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getClient();
  const link = await stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/** Pulls the connected account's current capability status from Stripe. */
export async function getAccountStatus(accountId: string) {
  const stripe = getClient();
  const account = await stripe.accounts.retrieve(accountId);
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

/** A link into the connected account's own Stripe Express dashboard. */
export async function createExpressDashboardLink(accountId: string): Promise<string> {
  const stripe = getClient();
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}

/**
 * Creates a one-off Stripe Payment Link for an invoice total so the
 * client can pay with a single tap from the SMS/email they receive.
 *
 * Created directly on the business's own connected account (a "direct
 * charge") so the money — and the Stripe fee — belongs to them, not us.
 * `applicationFeeCents` is optional and only applies if we're taking a
 * platform cut on top of Stripe's own fee.
 */
export async function createPaymentLinkForInvoice(params: {
  invoiceId: string;
  invoiceNumber: string;
  totalCents: number;
  stripeAccountId: string;
  applicationFeeCents?: number;
}): Promise<{ id: string; url: string }> {
  const stripe = getClient();
  const requestOptions = { stripeAccount: params.stripeAccountId };

  const price = await stripe.prices.create(
    {
      currency: "usd",
      unit_amount: params.totalCents,
      product_data: {
        name: `Invoice ${params.invoiceNumber}`,
      },
    },
    requestOptions,
  );

  const link = await stripe.paymentLinks.create(
    {
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { invoiceId: params.invoiceId },
      after_completion: {
        type: "redirect",
        redirect: { url: `${env.appBaseUrl}/invoices/${params.invoiceId}?paid=1` },
      },
      ...(params.applicationFeeCents
        ? { application_fee_amount: params.applicationFeeCents }
        : {}),
    },
    requestOptions,
  );

  return { id: link.id, url: link.url };
}

export function verifyStripeWebhook(rawBody: Buffer, signature: string): Stripe.Event {
  const stripe = getClient();
  return stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
}

/**
 * Connected-account events arrive with a different signature than events on
 * our own platform account, even when sent to the same URL — Stripe issues
 * a separate signing secret for a webhook endpoint registered to listen on
 * connected accounts.
 */
export function verifyStripeConnectWebhook(rawBody: Buffer, signature: string): Stripe.Event {
  const stripe = getClient();
  return stripe.webhooks.constructEvent(rawBody, signature, env.stripeConnectWebhookSecret);
}
