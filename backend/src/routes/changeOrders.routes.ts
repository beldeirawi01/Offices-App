import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/subscription";
import { HttpError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { deliverChangeOrderToClient } from "../services/notification.service";

export const changeOrdersRouter = Router();
// Mounted at bare "/api" in app.ts, same reasoning as voiceRouter/
// documentationRouter — "/jobs/:jobId/change-orders" for create/list,
// "/change-orders/:id/send" for the rest, so no single clean prefix.

const createSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  amount: z.number().positive(),
});

/**
 * Any tech can create one — they're the one on-site discovering the extra
 * work — not owner-only like approving a documentation photo for the client
 * invoice.
 */
changeOrdersRouter.post("/jobs/:jobId/change-orders", requireAuth, requireActiveSubscription, async (req, res) => {
  const body = createSchema.parse(req.body);
  const job = await prisma.job.findFirst({ where: { id: req.params.jobId, organizationId: req.auth!.organizationId } });
  if (!job) throw new HttpError(404, "Job not found");

  const changeOrder = await prisma.changeOrder.create({
    data: {
      organizationId: req.auth!.organizationId,
      jobId: job.id,
      description: body.description,
      amount: body.amount,
    },
  });
  res.status(201).json(changeOrder);
});

changeOrdersRouter.get("/jobs/:jobId/change-orders", requireAuth, requireActiveSubscription, async (req, res) => {
  const job = await prisma.job.findFirst({ where: { id: req.params.jobId, organizationId: req.auth!.organizationId } });
  if (!job) throw new HttpError(404, "Job not found");

  const changeOrders = await prisma.changeOrder.findMany({
    where: { jobId: job.id },
    include: { signature: { select: { signerName: true, signedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(changeOrders);
});

changeOrdersRouter.post("/change-orders/:id/send", requireAuth, requireActiveSubscription, async (req, res) => {
  const changeOrder = await prisma.changeOrder.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
    include: { job: { include: { client: true } }, organization: true },
  });
  if (!changeOrder) throw new HttpError(404, "Change order not found");
  if (changeOrder.status !== "PENDING") {
    throw new HttpError(400, `Cannot send a change order that is already ${changeOrder.status.toLowerCase()}`);
  }

  const client = changeOrder.job.client;
  const canEmail = Boolean(client.email);
  const canText = Boolean(client.phone && client.smsConsent);
  if (!canEmail && !canText) {
    throw new HttpError(
      400,
      client.phone && !client.smsConsent
        ? "Client has a phone number but has not consented to SMS, and has no email on file"
        : "Client has no email or SMS-consented phone number on file to deliver the change order to",
    );
  }

  const pageUrl = `${env.appBaseUrl}/change-orders/view/${changeOrder.publicToken}`;
  const deliveryResults = await deliverChangeOrderToClient({
    clientEmail: client.email,
    clientPhone: client.phone,
    clientSmsConsent: client.smsConsent,
    jobTitle: changeOrder.job.title,
    pageUrl,
    amount: changeOrder.amount,
    businessName: changeOrder.organization.name,
  });

  const anyDelivered = deliveryResults.some((r) => r.success);
  if (!anyDelivered) {
    throw new HttpError(502, "Failed to deliver the change order over every configured channel");
  }

  const updated = await prisma.changeOrder.update({ where: { id: changeOrder.id }, data: { sentAt: new Date() } });
  res.json({ changeOrder: updated, deliveryResults });
});
