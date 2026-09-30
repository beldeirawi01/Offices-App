import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/subscription";
import { HttpError, isForeignKeyConstraintError } from "../middleware/errorHandler";
import { convertQuoteToInvoice } from "../services/quote.service";

export const jobsRouter = Router();
jobsRouter.use(requireAuth);
jobsRouter.use(requireActiveSubscription);

const MAX_PAGE_SIZE = 100;
function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(query.pageSize ?? "25"), 10) || 25));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

// A valid from/to pair means the caller wants every job in that range at
// once (the calendar board), not one page at a time — an invalid or partial
// pair is ignored rather than rejected, so it just falls back to the normal
// paginated list.
function parseDateRange(query: Record<string, unknown>): { gte: Date; lte: Date } | null {
  if (!query.from || !query.to) return null;
  const gte = new Date(String(query.from));
  const lte = new Date(String(query.to));
  if (isNaN(gte.getTime()) || isNaN(lte.getTime())) return null;
  return { gte, lte };
}

// Scheduling view: upcoming jobs, optionally scoped to the logged-in tech.
jobsRouter.get("/", async (req, res) => {
  const { status, mine } = req.query;
  const dateRange = parseDateRange(req.query as Record<string, unknown>);

  const where = {
    organizationId: req.auth!.organizationId,
    ...(status ? { status: status as any } : {}),
    ...(mine === "true" ? { assignedTechId: req.auth!.userId } : {}),
    ...(dateRange ? { scheduledAt: dateRange } : {}),
  };

  // The calendar board needs the whole range in one shot, not a page — a
  // week/month of jobs is small enough that a generous cap is fine.
  if (dateRange) {
    const jobs = await prisma.job.findMany({
      where,
      include: { client: true, assignedTech: true, invoice: true, quote: true },
      orderBy: { scheduledAt: "asc" },
      take: 500,
    });
    res.json({ data: jobs, pagination: { page: 1, pageSize: jobs.length, total: jobs.length, totalPages: 1 } });
    return;
  }

  const { skip, take, page, pageSize } = parsePagination(req.query as Record<string, unknown>);
  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: { client: true, assignedTech: true, invoice: true, quote: true },
      orderBy: { scheduledAt: "asc" },
      skip,
      take,
    }),
    prisma.job.count({ where }),
  ]);
  res.json({ data: jobs, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});

jobsRouter.get("/:id", async (req, res) => {
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
    include: {
      client: true,
      assignedTech: true,
      voiceNotes: true,
      invoice: { include: { lineItems: true } },
      quote: { include: { lineItems: true } },
    },
  });
  if (!job) throw new HttpError(404, "Job not found");
  res.json(job);
});

const jobSchema = z.object({
  clientId: z.string(),
  assignedTechId: z.string().optional().nullable(),
  title: z.string().min(1),
  jobType: z.string().optional().nullable(),
  // Lets a tech starting a walk-in/unscheduled job create it directly as
  // IN_PROGRESS instead of always defaulting to SCHEDULED.
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  scheduledAt: z.coerce.date().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  // Months until this job type typically needs redoing (e.g. 6 for an HVAC
  // tune-up) — drives the automatic rebooking reminder. Null/omitted means
  // this job isn't a recurring service.
  recurrenceIntervalMonths: z.number().int().positive().optional().nullable(),
});

// Confirms clientId/assignedTechId (when provided) belong to the caller's own
// organization, so a job can't be created against another org's client or tech.
async function assertBelongsToOrg(organizationId: string, clientId?: string, assignedTechId?: string | null) {
  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
    if (!client) throw new HttpError(400, "Invalid clientId");
  }
  if (assignedTechId) {
    const tech = await prisma.user.findFirst({ where: { id: assignedTechId, organizationId } });
    if (!tech) throw new HttpError(400, "Invalid assignedTechId");
  }
}

jobsRouter.post("/", async (req, res) => {
  const body = jobSchema.parse(req.body);
  await assertBelongsToOrg(req.auth!.organizationId, body.clientId, body.assignedTechId);
  const job = await prisma.job.create({
    data: { ...body, organizationId: req.auth!.organizationId },
  });
  res.status(201).json(job);
});

const jobUpdateSchema = jobSchema.partial().extend({
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
});

jobsRouter.put("/:id", async (req, res) => {
  const body = jobUpdateSchema.parse(req.body);
  const existing = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!existing) throw new HttpError(404, "Job not found");
  await assertBelongsToOrg(req.auth!.organizationId, body.clientId, body.assignedTechId);

  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: {
      ...body,
      completedAt: body.status === "COMPLETED" ? new Date() : existing.completedAt,
    },
  });

  // Newly marked complete, with an accepted quote still waiting to become an
  // invoice — convert it automatically so the tech doesn't have to remember
  // to do it by hand. Failure here shouldn't fail the job update itself
  // (e.g. a quote already converted, or the tech also created a manual
  // invoice in the meantime) — just log it.
  if (body.status === "COMPLETED" && existing.status !== "COMPLETED") {
    const quote = await prisma.quote.findUnique({ where: { jobId: job.id } });
    if (quote && quote.status === "ACCEPTED") {
      try {
        await convertQuoteToInvoice(quote.id);
      } catch (err) {
        console.error(`Auto-convert of quote ${quote.id} on job completion failed`, err);
      }
    }
  }

  res.json(job);
});

jobsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!existing) throw new HttpError(404, "Job not found");

  try {
    await prisma.job.delete({ where: { id: req.params.id } });
  } catch (err) {
    if (isForeignKeyConstraintError(err)) {
      throw new HttpError(409, "Cannot delete this job — it still has a quote, invoice, or recorded notes on file");
    }
    throw err;
  }
  res.status(204).send();
});
