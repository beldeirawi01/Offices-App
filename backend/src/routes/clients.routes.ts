import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/subscription";
import { HttpError, isForeignKeyConstraintError } from "../middleware/errorHandler";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);
clientsRouter.use(requireActiveSubscription);

const MAX_PAGE_SIZE = 100;
function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(query.pageSize ?? "25"), 10) || 25));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

clientsRouter.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const { skip, take, page, pageSize } = parsePagination(req.query as Record<string, unknown>);

  const where = {
    organizationId: req.auth!.organizationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({ where, orderBy: { name: "asc" }, skip, take }),
    prisma.client.count({ where }),
  ]);
  res.json({ data: clients, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
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
  smsConsent: z.boolean().optional(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  followUpsEnabled: z.boolean().optional(),
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

  try {
    await prisma.client.delete({ where: { id: req.params.id } });
  } catch (err) {
    if (isForeignKeyConstraintError(err)) {
      throw new HttpError(409, "Cannot delete this client — they still have jobs or invoices on file");
    }
    throw err;
  }
  res.status(204).send();
});
