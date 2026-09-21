import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";

export const authRouter = Router();

const registerSchema = z.object({
  organizationName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

// First user for a new organization is always the OWNER.
authRouter.post("/register", async (req, res) => {
  const body = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(body.password, 10);

  const organization = await prisma.organization.create({
    data: { name: body.organizationName },
  });

  const user = await prisma.user.create({
    data: {
      organizationId: organization.id,
      name: body.name,
      email: body.email,
      passwordHash,
      role: "OWNER",
    },
  });

  const token = signToken(user.id, organization.id, user.role);
  res.status(201).json({ token, user: toPublicUser(user) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const body = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = signToken(user.id, user.organizationId, user.role);
  res.json({ token, user: toPublicUser(user) });
});

function signToken(userId: string, organizationId: string, role: string) {
  return jwt.sign({ userId, organizationId, role }, env.jwtSecret, { expiresIn: "30d" });
}

function toPublicUser(user: { id: string; name: string; email: string; role: string; organizationId: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId };
}
