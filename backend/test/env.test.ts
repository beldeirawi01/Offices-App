import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts reads process.env once at module load, so exercising validateEnv()
// under different configurations means resetting the module registry and
// re-importing after setting process.env — a real re-run of that startup
// logic, not just calling a function with mocked inputs.
const KEYS = ["DATABASE_URL", "NODE_ENV", "JWT_SECRET", "ALLOWED_ORIGINS"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.resetModules();
});

async function loadValidateEnv() {
  vi.resetModules();
  const mod = await import("../src/config/env");
  return mod.validateEnv;
}

describe("validateEnv", () => {
  it("flags a missing DATABASE_URL regardless of environment", async () => {
    process.env.DATABASE_URL = "";
    process.env.NODE_ENV = "development";
    const validateEnv = await loadValidateEnv();
    expect(validateEnv()).toContain("DATABASE_URL is not set");
  });

  it("requires a real JWT_SECRET in production instead of the dev fallback", async () => {
    process.env.DATABASE_URL = "postgresql://x/y";
    process.env.NODE_ENV = "production";
    // "" rather than delete: dotenv's own re-run inside env.ts (no override)
    // would otherwise repopulate this from whatever real .env file happens
    // to exist on this machine, which isn't what this test means to check.
    process.env.JWT_SECRET = "";
    process.env.ALLOWED_ORIGINS = "https://app.example.com";
    const validateEnv = await loadValidateEnv();
    expect(validateEnv().some((p) => p.includes("JWT_SECRET"))).toBe(true);
  });

  it("requires ALLOWED_ORIGINS in production", async () => {
    process.env.DATABASE_URL = "postgresql://x/y";
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "a-real-production-secret";
    process.env.ALLOWED_ORIGINS = "";
    const validateEnv = await loadValidateEnv();
    expect(validateEnv().some((p) => p.includes("ALLOWED_ORIGINS"))).toBe(true);
  });

  it("passes with a complete production config", async () => {
    process.env.DATABASE_URL = "postgresql://x/y";
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "a-real-production-secret";
    process.env.ALLOWED_ORIGINS = "https://app.example.com";
    const validateEnv = await loadValidateEnv();
    expect(validateEnv()).toEqual([]);
  });

  it("does not require JWT_SECRET or ALLOWED_ORIGINS outside production", async () => {
    process.env.DATABASE_URL = "postgresql://x/y";
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "";
    process.env.ALLOWED_ORIGINS = "";
    const validateEnv = await loadValidateEnv();
    expect(validateEnv()).toEqual([]);
  });
});
