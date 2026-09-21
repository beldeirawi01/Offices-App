import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

clientsRouter.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  const clients = await prisma.client.findMany({
    where: {
      organizationId: req.auth!.organizationId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
  res.json(clients);
});

clientsRouter.get("/:id", async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
    include: {
      jobs: { orderBy: { scheduledAt: "desc" } },
      invoices: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) throw new HttpError(404, "Client not found");
  res.json(client);
});

const clientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

clientsRouter.post("/", async (req, res) => {
  const body = clientSchema.parse(req.body);
  const client = await prisma.client.create({
    data: { ...body, organizationId: req.auth!.organizationId },
  });
  res.status(201).json(client);
});

clientsRouter.put("/:id", async (req, res) => {
  const body = clientSchema.partial().parse(req.body);
  const existing = await prisma.client.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!existing) throw new HttpError(404, "Client not found");

  const client = await prisma.client.update({ where: { id: req.params.id }, data: body });
  res.json(client);
});

clientsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.client.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!existing) throw new HttpError(404, "Client not found");

  await prisma.client.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
