import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Tags every request with an id — reused from an upstream proxy/load
 * balancer's X-Request-Id header when present, otherwise generated here —
 * so a single request can be traced across access logs, error logs, and
 * Sentry events instead of grepping by timestamp and hoping.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  req.id = (req.headers["x-request-id"] as string | undefined) || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
