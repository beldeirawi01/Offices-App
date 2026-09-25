import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { prisma } from "./db/prisma";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter, authLimiter, voiceUploadLimiter } from "./middleware/rateLimit";
import { authRouter } from "./routes/auth.routes";
import { clientsRouter } from "./routes/clients.routes";
import { jobsRouter } from "./routes/jobs.routes";
import { voiceRouter } from "./routes/voice.routes";
import { documentationRouter } from "./routes/documentation.routes";
import { invoicesRouter } from "./routes/invoices.routes";
import { quotesRouter } from "./routes/quotes.routes";
import { paymentsRouter } from "./routes/payments.routes";
import { reportsRouter } from "./routes/reports.routes";
import { usersRouter } from "./routes/users.routes";
import { publicRouter } from "./routes/public.routes";
import { organizationsRouter } from "./routes/organizations.routes";

export const app = express();

app.use(helmet());

// In development, allow any origin so localhost dashboard/mobile testing just
// works. In production, ALLOWED_ORIGINS must be set — an empty allowlist there
// would otherwise silently block every real request from your deployed dashboard.
if (env.nodeEnv === "development" || env.nodeEnv === "test" || env.allowedOrigins.length === 0) {
  if (env.nodeEnv !== "development" && env.nodeEnv !== "test") {
    console.warn("ALLOWED_ORIGINS is not set in a non-development environment — CORS will block all origins.");
  }
  app.use(cors(env.nodeEnv === "development" || env.nodeEnv === "test" ? undefined : { origin: false }));
} else {
  app.use(cors({ origin: env.allowedOrigins }));
}

if (env.nodeEnv !== "test") {
  app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));
}
app.use(apiLimiter);

// Stripe webhooks need the raw body for signature verification, so this is
// mounted before the JSON body parser. Covers both the platform-account
// webhook and the Connect-scoped one (see routes/payments.routes.ts).
app.use("/api/payments", express.raw({ type: "application/json" }), paymentsRouter);

app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unreachable" });
  }
});

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/jobs/:jobId/voice-notes", voiceUploadLimiter);
app.use("/api", voiceRouter);
app.use("/api/jobs/:jobId/documentation", voiceUploadLimiter);
app.use("/api", documentationRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/users", usersRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/public", publicRouter);

app.use(errorHandler);
