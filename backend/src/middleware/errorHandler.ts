import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { Sentry } from "../config/sentry";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * True for Prisma's "foreign key constraint failed" error (P2003) — thrown
 * when deleting a row that other rows still reference (e.g. a client with
 * jobs on file). Callers should catch this and throw a clear HttpError(409)
 * instead of letting it fall through to a generic 500.
 */
export function isForeignKeyConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  if (err instanceof HttpError) {
    if (err.status >= 500) Sentry.captureException(err);
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  Sentry.captureException(err);
  return res.status(500).json({ error: "Internal server error" });
}
