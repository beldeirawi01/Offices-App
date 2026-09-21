import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthPayload {
  userId: string;
  organizationId: string;
  role: "OWNER" | "TECH";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "OWNER") {
    return res.status(403).json({ error: "Owner role required" });
  }
  next();
}
