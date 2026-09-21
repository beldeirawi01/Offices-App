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

  sendgridApiKey: process.env.SENDGRID_API_KEY ?? "",
  sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL ?? "",

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
};
