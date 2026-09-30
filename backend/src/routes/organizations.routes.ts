import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, requireOwner } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { deleteStoredFile } from "../services/storage.service";
import {
  createConnectedAccount,
  createOnboardingLink,
  createExpressDashboardLink,
  getAccountStatus,
  createBillingCustomer,
  createSubscriptionCheckoutSession,
  createBillingPortalLink,
  cancelSubscription,
} from "../services/payment.service";
import { getAuthorizationUrl, disconnectOrganization, isQuickbooksConfigured } from "../services/quickbooks.service";
import { syncUnsyncedInvoices } from "../services/quickbooksSync.service";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

// The org row now carries QuickBooks OAuth tokens (see quickbooks.service.ts)
// — real bearer credentials, not business data, so they're stripped from
// every response that serializes an Organization rather than trusted to
// never accidentally leak to the dashboard/a network inspector/an export file.
function toSafeOrganization<T extends { quickbooksAccessToken?: string | null; quickbooksRefreshToken?: string | null }>(
  org: T,
) {
  const { quickbooksAccessToken, quickbooksRefreshToken, ...safe } = org;
  return { ...safe, quickbooksConnected: Boolean(quickbooksAccessToken) };
}

organizationsRouter.get("/me", async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });
  res.json(toSafeOrganization(org));
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
  res.json(toSafeOrganization(org));
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
  res.json(toSafeOrganization(updated));
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

// Kicks off Intuit's hosted OAuth consent screen. The redirect back
// (GET /api/organizations/me/quickbooks/callback) is mounted directly on
// the app, not on this router, since it's an unauthenticated browser
// redirect with no Authorization header — see app.ts.
organizationsRouter.post("/me/quickbooks/connect", requireOwner, async (req, res) => {
  if (!isQuickbooksConfigured()) throw new HttpError(400, "QuickBooks integration is not configured on this server");
  const url = getAuthorizationUrl(req.auth!.organizationId);
  res.json({ url });
});

organizationsRouter.post("/me/quickbooks/disconnect", requireOwner, async (req, res) => {
  await disconnectOrganization(req.auth!.organizationId);
  res.status(204).send();
});

// Catches up anything not yet pushed (or that failed on an earlier attempt)
// — the normal path is automatic on invoice send/mark-paid (see
// invoices.routes.ts), this is for a first connect or recovering from an
// earlier outage.
organizationsRouter.post("/me/quickbooks/sync", requireOwner, async (req, res) => {
  const result = await syncUnsyncedInvoices(req.auth!.organizationId);
  res.json(result);
});

// A full export of everything this business has stored in Jobscribe — the
// "right to access" half of a GDPR-style data request. Deliberately excludes
// the actual photo/audio binary content (storage keys are included as
// metadata, but downloading a multi-megabyte JSON blob with base64 media
// embedded isn't a reasonable default); an owner who needs the raw files
// should be pointed at the documentation photo endpoint / their S3 bucket.
organizationsRouter.get("/me/export", requireOwner, async (req, res) => {
  const organizationId = req.auth!.organizationId;

  const [organization, users, clients, jobs] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true, role: true, phone: true, createdAt: true },
    }),
    prisma.client.findMany({ where: { organizationId } }),
    prisma.job.findMany({
      where: { organizationId },
      include: {
        client: { select: { id: true, name: true } },
        assignedTech: { select: { id: true, name: true } },
        voiceNotes: true,
        documentation: true,
        invoice: { include: { lineItems: true, payments: true, deliveries: true } },
        quote: { include: { lineItems: true, deliveries: true } },
      },
    }),
  ]);

  res.setHeader("Content-Disposition", `attachment; filename="jobscribe-export-${organizationId}.json"`);
  res.json({ exportedAt: new Date().toISOString(), organization: toSafeOrganization(organization), users, clients, jobs });
});

const deleteAccountSchema = z.object({ password: z.string().min(1) });

// Permanently deletes this business's account and every row of data it
// owns — the "right to erasure" half of a GDPR-style request. Requires the
// owner's current password as confirmation, same pattern as changing a
// password, since there's no more destructive action in the whole app.
// Existing JWTs for this org become inert the moment this completes (every
// row they could reference is gone), but aren't individually revoked —
// there's no server-side session store to revoke them from.
organizationsRouter.post("/me/delete", requireOwner, async (req, res) => {
  const body = deleteAccountSchema.parse(req.body);
  const organizationId = req.auth!.organizationId;

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  const valid = await bcrypt.compare(body.password, owner.passwordHash);
  if (!valid) throw new HttpError(401, "Password is incorrect");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  // Best-effort — Stripe being unreachable shouldn't strand an owner unable
  // to delete their own data; they can still cancel from their card/bank
  // statement if this fails.
  if (org.stripeSubscriptionId) {
    await cancelSubscription(org.stripeSubscriptionId).catch((err) => {
      console.error(`Failed to cancel Stripe subscription for org ${organizationId} during account deletion`, err);
    });
  }

  const jobs = await prisma.job.findMany({ where: { organizationId }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);

  const [voiceNotes, documentation] = await Promise.all([
    prisma.voiceNote.findMany({ where: { jobId: { in: jobIds } }, select: { audioUrl: true, audioDeleted: true } }),
    prisma.jobDocumentation.findMany({
      where: { jobId: { in: jobIds } },
      select: { photoStorageKey: true, audioStorageKey: true },
    }),
  ]);

  // Delete the underlying files before the DB rows that reference them.
  // Best-effort and logged rather than fatal — an unreachable S3 shouldn't
  // block an owner from deleting their own account data; any file left
  // behind after this is an orphan with nothing in our database pointing at
  // it, not exposed data.
  await Promise.all([
    ...voiceNotes
      .filter((v) => !v.audioDeleted)
      .map((v) => deleteStoredFile(v.audioUrl).catch((err) => console.error("Failed to delete voice note audio during account deletion", err))),
    ...documentation.map((d) =>
      deleteStoredFile(d.photoStorageKey).catch((err) => console.error("Failed to delete job photo during account deletion", err)),
    ),
    ...documentation
      .filter((d): d is typeof d & { audioStorageKey: string } => d.audioStorageKey != null)
      .map((d) => deleteStoredFile(d.audioStorageKey).catch((err) => console.error("Failed to delete documentation audio during account deletion", err))),
  ]);

  // Deletion order matters: children before the parents they have a
  // (non-cascading) foreign key into, so nothing hits a constraint
  // violation partway through. LineItem/QuoteLineItem aren't listed here —
  // they cascade automatically when their Invoice/Quote is deleted.
  await prisma.$transaction([
    prisma.payment.deleteMany({ where: { invoice: { organizationId } } }),
    prisma.invoiceDelivery.deleteMany({ where: { invoice: { organizationId } } }),
    prisma.quoteDelivery.deleteMany({ where: { quote: { organizationId } } }),
    prisma.voiceNote.deleteMany({ where: { jobId: { in: jobIds } } }),
    prisma.jobDocumentation.deleteMany({ where: { jobId: { in: jobIds } } }),
    prisma.invoice.deleteMany({ where: { organizationId } }),
    prisma.quote.deleteMany({ where: { organizationId } }),
    prisma.job.deleteMany({ where: { organizationId } }),
    prisma.client.deleteMany({ where: { organizationId } }),
    prisma.user.deleteMany({ where: { organizationId } }),
    prisma.organization.delete({ where: { id: organizationId } }),
  ]);

  res.status(204).send();
});
