import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

/** Compares two "x.y.z" version strings. Returns <0, 0, or >0 like a normal comparator. */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((n) => parseInt(n, 10) || 0);
  const partsB = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * A no-op unless the request carries an X-App-Version header — only the
 * mobile app sends one, so this never affects the dashboard (a web deploy
 * has no equivalent "old installed copy" problem). Lets an old mobile build
 * be forced to update once MOBILE_MIN_VERSION is raised past it, instead of
 * calling an API it may no longer be compatible with.
 */
export function minAppVersion(req: Request, res: Response, next: NextFunction) {
  const clientVersion = req.headers["x-app-version"];
  if (typeof clientVersion !== "string") return next();

  if (compareVersions(clientVersion, env.mobileMinVersion) < 0) {
    return res.status(426).json({
      error: "This version of the app is no longer supported. Please update from the App Store or Play Store.",
    });
  }

  next();
}
