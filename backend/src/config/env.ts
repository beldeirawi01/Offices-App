import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
  databaseUrl: process.env.DATABASE_URL ?? "",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:5173",

  openaiApiKey: process.env.OPENAI_API_KEY ?? "",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",

  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  // This backend's own public URL (e.g. https://api.jobscribe.com), used only
  // to reconstruct the exact webhook URL Twilio signs against when verifying
  // an inbound SMS request — must match the URL configured on the Twilio
  // number exactly (scheme, host, path).
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "",

  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  brevoFromEmail: process.env.BREVO_FROM_EMAIL ?? "",

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Separate secret because Stripe issues a distinct signing secret for a
  // webhook endpoint registered to listen on connected accounts (Stripe
  // Connect) vs. one listening on your own platform account, even if both
  // point at this same server.
  stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "",

  // The Price object (recurring, $29/month) for Jobscribe's own flat-rate
  // subscription — created once in the Stripe Dashboard or CLI, not by this
  // app, since it's a real billing decision, not something to fabricate.
  stripeSubscriptionPriceId: process.env.STRIPE_SUBSCRIPTION_PRICE_ID ?? "",

  // Comma-separated list of origins allowed to call this API (dashboard, mobile
  // in dev). Falls back to permissive CORS only in development.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // S3-compatible object storage for voice note audio (AWS S3, Cloudflare R2,
  // Backblaze B2, etc). If unset, falls back to local disk (dev only — do not
  // rely on local disk in production, most hosts have ephemeral filesystems).
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",

  sentryDsn: process.env.SENTRY_DSN ?? "",

  // Lowest mobile app version (matches mobile/app.json's "version") still
  // allowed to call the API. "0.0.0" (the default) allows everything — set
  // this once you've actually published a versioned build and want to be
  // able to force techs off an old one that behaves in a way this backend
  // no longer supports.
  mobileMinVersion: process.env.MOBILE_MIN_VERSION ?? "0.0.0",

  // Caps one organization's combined voice-note + documentation-with-audio
  // uploads per calendar month, since each one is a real, billed Whisper +
  // Claude call — bounds worst-case spend from one heavy or runaway org.
  // 1000/month is generous for even a busy multi-tech shop while still
  // capping exposure; raise it per-deployment if a real business needs more.
  maxVoiceUploadsPerOrgPerMonth: Number(process.env.MAX_VOICE_UPLOADS_PER_ORG_PER_MONTH ?? 1000),
};

/**
 * Checks the things that are always required to run at all (a database to
 * connect to) or that would be a serious, easy-to-miss problem specifically
 * in production (booting with the hardcoded dev JWT secret, or with no CORS
 * allowlist so the real dashboard can't reach the API). Deliberately does
 * NOT require the third-party integration keys (OpenAI, Twilio, Stripe,
 * S3, ...) — the app is designed to run in a degraded-but-functional mode
 * without those, failing clearly only when a feature that needs one is
 * actually used, not at startup.
 *
 * Called explicitly from index.ts (the real server entrypoint) rather than
 * automatically at module load, so importing env.ts from a test or script
 * never triggers it.
 */
export function validateEnv(): string[] {
  const problems: string[] = [];

  if (!env.databaseUrl) {
    problems.push("DATABASE_URL is not set");
  }

  if (env.nodeEnv === "production") {
    if (!process.env.JWT_SECRET) {
      problems.push("JWT_SECRET is not set — refusing to run in production with the default development secret");
    }
    if (env.allowedOrigins.length === 0) {
      problems.push("ALLOWED_ORIGINS is not set — no origin will be able to call this API in production");
    }
  }

  return problems;
}
