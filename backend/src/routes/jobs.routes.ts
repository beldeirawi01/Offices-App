import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

// Scheduling view: upcoming jobs, optionally scoped to the logged-in tech.
jobsRouter.get("/", async (req, res) => {
  const { status, mine } = req.query;

  const jobs = await prisma.job.findMany({
    where: {
      organizationId: req.auth!.organizationId,
      ...(status ? { status: status as any } : {}),
      ...(mine === "true" ? { assignedTechId: req.auth!.userId } : {}),
    },
    include: { client: true, assignedTech: true, invoice: true },
    orderBy: { scheduledAt: "asc" },
  });
  res.json(jobs);
});

jobsRouter.get("/:id", async (req, res) => {
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
    include: { client: true, assignedTech: true, voiceNotes: true, invoice: { include: { lineItems: true } } },
  });
  if (!job) throw new HttpError(404, "Job not found");
  res.json(job);
});

const jobSchema = z.object({
  clientId: z.string(),
  assignedTechId: z.string().optional().nullable(),
  title: z.string().min(1),
  jobType: z.string().optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
});

jobsRouter.post("/", async (req, res) => {
  const body = jobSchema.parse(req.body);
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

  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: {
      ...body,
      completedAt: body.status === "COMPLETED" ? new Date() : existing.completedAt,
    },
  });
  res.json(job);
});

jobsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!existing) throw new HttpError(404, "Job not found");

  await prisma.job.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
