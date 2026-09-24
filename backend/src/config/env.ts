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

  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  brevoFromEmail: process.env.BREVO_FROM_EMAIL ?? "",

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Separate secret because Stripe issues a distinct signing secret for a
  // webhook endpoint registered to listen on connected accounts (Stripe
  // Connect) vs. one listening on your own platform account, even if both
  // point at this same server.
  stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "",

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
};
