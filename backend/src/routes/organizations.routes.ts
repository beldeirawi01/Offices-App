import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, requireOwner } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { env } from "../config/env";
import {
  createConnectedAccount,
  createOnboardingLink,
  createExpressDashboardLink,
  getAccountStatus,
  createBillingCustomer,
  createSubscriptionCheckoutSession,
  createBillingPortalLink,
} from "../services/payment.service";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

organizationsRouter.get("/me", async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });
  res.json(org);
});

const validTimezones = new Set(Intl.supportedValuesOf("timeZone"));

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  // Stored as a decimal fraction (0.0825 = 8.25%), but the dashboard sends/
  // shows it as a percentage — converted at the API boundary, not in the DB.
  taxRatePercent: z.number().min(0).max(100).optional(),
  reviewRequestEnabled: z.boolean().optional(),
  reviewRequestDelayDays: z.number().int().positive().optional(),
  reviewLinkUrl: z.string().url().optional().nullable(),
  rebookingRemindersEnabled: z.boolean().optional(),
  timezone: z.string().refine((tz) => validTimezones.has(tz), "Not a recognized timezone").optional(),
});

organizationsRouter.put("/me", requireOwner, async (req, res) => {
  const body = updateSchema.parse(req.body);
  const org = await prisma.organization.update({
    where: { id: req.auth!.organizationId },
    data: {
      name: body.name,
      taxRate: body.taxRatePercent != null ? body.taxRatePercent / 100 : undefined,
      reviewRequestEnabled: body.reviewRequestEnabled,
      reviewRequestDelayDays: body.reviewRequestDelayDays,
      reviewLinkUrl: body.reviewLinkUrl,
      rebookingRemindersEnabled: body.rebookingRemindersEnabled,
      timezone: body.timezone,
    },
  });
  res.json(org);
});

// Kicks off (or resumes) Stripe's hosted onboarding for this business's own
// connected account. Creates the account on first call; every call issues a
// fresh single-use link, since Stripe's account links expire quickly.
organizationsRouter.post("/me/stripe/onboard", requireOwner, async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });

  let accountId = org.stripeAccountId;
  if (!accountId) {
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    accountId = await createConnectedAccount(owner.email);
    await prisma.organization.update({ where: { id: org.id }, data: { stripeAccountId: accountId } });
  }

  const url = await createOnboardingLink({
    accountId,
    refreshUrl: `${env.appBaseUrl}/settings?stripe=refresh`,
    returnUrl: `${env.appBaseUrl}/settings?stripe=return`,
  });
  res.json({ url });
});

// Called when the owner lands back on /settings after Stripe's hosted flow
// (or any time the dashboard wants a fresh read) — pulls the connected
// account's current capability status rather than trusting a stale value.
organizationsRouter.post("/me/stripe/refresh-status", requireOwner, async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });
  if (!org.stripeAccountId) throw new HttpError(400, "No Stripe account has been started yet");

  const status = await getAccountStatus(org.stripeAccountId);
  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: {
      stripeChargesEnabled: status.chargesEnabled,
      stripePayoutsEnabled: status.payoutsEnabled,
      stripeDetailsSubmitted: status.detailsSubmitted,
    },
  });
  res.json(updated);
});

// A link into the business's own Stripe Express dashboard (payouts,
// balance, account details) — not our dashboard.
organizationsRouter.get("/me/stripe/dashboard-link", requireOwner, async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });
  if (!org.stripeAccountId) throw new HttpError(400, "Connect a Stripe account first");

  const url = await createExpressDashboardLink(org.stripeAccountId);
  res.json({ url });
});

// Starts Stripe Checkout for Jobscribe's own flat $29/month subscription —
// distinct from the client-payment Stripe Connect flow above. Creates the
// platform-side billing Customer on first call.
organizationsRouter.post("/me/subscription/checkout", requireOwner, async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    customerId = await createBillingCustomer(owner.email, org.id);
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: customerId } });
  }

  const url = await createSubscriptionCheckoutSession({
    organizationId: org.id,
    customerId,
    successUrl: `${env.appBaseUrl}/settings?subscription=return`,
    cancelUrl: `${env.appBaseUrl}/settings?subscription=cancelled`,
  });
  res.json({ url });
});

// A link into Stripe's hosted Billing Portal to update card details, view
// past invoices, or cancel — not something we build ourselves.
organizationsRouter.get("/me/subscription/portal", requireOwner, async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });
  if (!org.stripeCustomerId) throw new HttpError(400, "No subscription has been started yet");

  const url = await createBillingPortalLink(org.stripeCustomerId, `${env.appBaseUrl}/settings`);
  res.json({ url });
});
