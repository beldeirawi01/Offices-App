import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, requireOwner } from "../middleware/auth";

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
