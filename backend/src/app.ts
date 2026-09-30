import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { prisma } from "./db/prisma";
import { errorHandler } from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";
import { minAppVersion } from "./middleware/minAppVersion";
import { apiLimiter, authLimiter, voiceUploadLimiter } from "./middleware/rateLimit";
import { authRouter } from "./routes/auth.routes";
import { clientsRouter } from "./routes/clients.routes";
import { jobsRouter } from "./routes/jobs.routes";
import { voiceRouter } from "./routes/voice.routes";
import { documentationRouter } from "./routes/documentation.routes";
import { changeOrdersRouter } from "./routes/changeOrders.routes";
import { invoicesRouter } from "./routes/invoices.routes";
import { quotesRouter } from "./routes/quotes.routes";
import { paymentsRouter } from "./routes/payments.routes";
import { reportsRouter } from "./routes/reports.routes";
import { usersRouter } from "./routes/users.routes";
import { publicRouter } from "./routes/public.routes";
import { organizationsRouter } from "./routes/organizations.routes";
import { twilioRouter } from "./routes/twilio.routes";
import { connectOrganization, verifyOAuthState } from "./services/quickbooks.service";

export const app = express();

app.use(requestId);
app.use(helmet());
app.use(minAppVersion);

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

morgan.token("req-id", (req) => (req as express.Request).id);
// Same fields as morgan's built-in "dev"/"combined" formats, with the
// request id prefixed so an access log line can be matched to an error log
// line or a Sentry event for the same request.
const devLogFormat = ":req-id :method :url :status :response-time ms - :res[content-length]";
const prodLogFormat =
  ':req-id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';
if (env.nodeEnv !== "test") {
  app.use(morgan(env.nodeEnv === "development" ? devLogFormat : prodLogFormat));
}
app.use(apiLimiter);

// Stripe webhooks need the raw body for signature verification, so this is
// mounted before the JSON body parser. Covers both the platform-account
// webhook and the Connect-scoped one (see routes/payments.routes.ts).
app.use("/api/payments", express.raw({ type: "application/json" }), paymentsRouter);

// Twilio posts application/x-www-form-urlencoded and signs the request
// against that exact parsed body, so this also needs its own parser ahead
// of the global JSON one (see routes/twilio.routes.ts).
app.use("/api/webhooks/twilio", express.urlencoded({ extended: false }), twilioRouter);

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
app.use("/api", changeOrdersRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/users", usersRouter);
// Intuit's OAuth redirect lands here as a plain browser GET with no
// Authorization header, so it's mounted directly on the app rather than on
// organizationsRouter (which requires auth for every route). The `state`
// query param — a signed JWT minted in quickbooks.service.ts — is what
// identifies which organization's "Connect" click this is answering.
app.get("/api/organizations/me/quickbooks/callback", async (req, res) => {
  const { code, realmId, state, error } = req.query;
  if (typeof state !== "string") {
    return res.status(400).send("Missing or invalid QuickBooks connection request.");
  }

  let organizationId: string;
  try {
    organizationId = verifyOAuthState(state);
  } catch {
    return res
      .status(400)
      .send("This QuickBooks connection link has expired or is invalid — please try connecting again from Settings.");
  }

  if (error || typeof code !== "string" || typeof realmId !== "string") {
    return res.redirect(`${env.appBaseUrl}/settings?quickbooks=denied`);
  }

  try {
    await connectOrganization(organizationId, code, realmId);
    res.redirect(`${env.appBaseUrl}/settings?quickbooks=return`);
  } catch (err) {
    console.error(`QuickBooks OAuth callback failed for org ${organizationId}`, err);
    res.redirect(`${env.appBaseUrl}/settings?quickbooks=error`);
  }
});

app.use("/api/organizations", organizationsRouter);
app.use("/api/public", publicRouter);

app.use(errorHandler);
