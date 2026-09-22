import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, requireOwner } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// List techs/owners in the org, e.g. to populate an "assign tech" dropdown.
usersRouter.get("/", async (req, res) => {
  const users = await prisma.user.findMany({
    where: { organizationId: req.auth!.organizationId },
    select: { id: true, name: true, email: true, role: true, phone: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["OWNER", "TECH"]).default("TECH"),
  phone: z.string().optional(),
});

// Owner invites a tech (or another owner) into the organization.
usersRouter.post("/", requireOwner, async (req, res) => {
  const body = inviteSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw new HttpError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.create({
    data: {
      organizationId: req.auth!.organizationId,
      name: body.name,
      email: body.email,
      passwordHash,
      role: body.role,
      phone: body.phone,
    },
    select: { id: true, name: true, email: true, role: true, phone: true },
  });

  res.status(201).json(user);
});

// Removes a team member. Jobs previously assigned to them become unassigned
// rather than being deleted or blocked by a foreign-key error.
usersRouter.delete("/:id", requireOwner, async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId },
  });
  if (!target) throw new HttpError(404, "Team member not found");

  if (target.id === req.auth!.userId) {
    throw new HttpError(400, "You can't remove your own account");
  }

  if (target.role === "OWNER") {
    const ownerCount = await prisma.user.count({
      where: { organizationId: req.auth!.organizationId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      throw new HttpError(400, "Cannot remove the only owner of the organization");
    }
  }

  await prisma.$transaction([
    prisma.job.updateMany({ where: { assignedTechId: target.id }, data: { assignedTechId: null } }),
    prisma.user.delete({ where: { id: target.id } }),
  ]);

  res.status(204).send();
});
