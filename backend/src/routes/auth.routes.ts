import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { sendEmail } from "../services/notification.service";

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

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.put("/password", requireAuth, async (req, res) => {
  const body = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });

  const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(401, "Current password is incorrect");

  const passwordHash = await bcrypt.hash(body.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ success: true });
});

const RESET_TOKEN_PURPOSE = "password_reset";

const forgotPasswordSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot-password", async (req, res) => {
  const body = forgotPasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });

  // Always respond the same way whether or not the email exists, so this
  // endpoint can't be used to enumerate registered accounts.
  if (user) {
    const token = jwt.sign({ userId: user.id, purpose: RESET_TOKEN_PURPOSE }, env.jwtSecret, { expiresIn: "30m" });
    const resetUrl = `${env.appBaseUrl}/reset-password/${token}`;
    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your Offices App password",
        text: `Reset your password: ${resetUrl}\n\nThis link expires in 30 minutes. If you didn't request this, ignore this email.`,
        html: `<p>Reset your password by clicking below. This link expires in 30 minutes.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });
    } catch (err) {
      // Don't leak delivery failures to the caller — same reasoning as above —
      // but log it so a misconfigured SENDGRID_API_KEY is visible server-side.
      console.error("Failed to send password reset email", err);
    }
  }

  res.json({ success: true });
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post("/reset-password", async (req, res) => {
  const body = resetPasswordSchema.parse(req.body);

  let payload: { userId: string; purpose: string };
  try {
    payload = jwt.verify(body.token, env.jwtSecret) as { userId: string; purpose: string };
  } catch {
    throw new HttpError(400, "This reset link is invalid or has expired");
  }
  if (payload.purpose !== RESET_TOKEN_PURPOSE) {
    throw new HttpError(400, "This reset link is invalid or has expired");
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 10);
  await prisma.user.update({ where: { id: payload.userId }, data: { passwordHash } });
  res.json({ success: true });
});

function signToken(userId: string, organizationId: string, role: string) {
  return jwt.sign({ userId, organizationId, role }, env.jwtSecret, { expiresIn: "30d" });
}

function toPublicUser(user: { id: string; name: string; email: string; role: string; organizationId: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId };
}
