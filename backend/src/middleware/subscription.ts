import { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { HttpError } from "./errorHandler";

/**
 * Gates the core product behind an active trial or paid subscription. Must
 * run after requireAuth (needs req.auth.organizationId).
 *
 * PAST_DUE is still let through — Stripe itself retries a failed card for
 * days before giving up, and locking the business out the moment a charge
 * first fails (rather than once Stripe gives up and the subscription
 * actually lapses) would be punitive for a temporary card issue.
 *
 * An org with no trialEndsAt at all (every org created before this feature
 * shipped) is treated as still allowed — this is a grandfather clause, not
 * a bug: we didn't retroactively cut off businesses already using the app.
 */
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });

  const trialActive = org.subscriptionStatus === "TRIALING" && (!org.trialEndsAt || org.trialEndsAt > new Date());
  const paidActive = org.subscriptionStatus === "ACTIVE" || org.subscriptionStatus === "PAST_DUE";

  if (trialActive || paidActive) {
    return next();
  }

  throw new HttpError(402, "Your Jobscribe trial has ended. Subscribe in Settings to keep using the app.");
}
