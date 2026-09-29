import { existsSync } from "fs";
import { defineConfig, devices } from "@playwright/test";

// Some sandboxes/CI images pre-install Chromium at a fixed path instead of
// the exact revision @playwright/test's own version would try to download
// (useful when outbound access to Playwright's CDN is restricted). Only
// used if that literal path actually exists — everywhere else (a normal
// dev machine, most CI images) this falls back to Playwright's own browser
// resolution untouched.
const SANDBOX_CHROMIUM_PATH = "/opt/pw-browsers/chromium";
const sandboxChromiumAvailable = existsSync(SANDBOX_CHROMIUM_PATH);

// A dedicated port/database, separate from both normal local dev
// (offices_app_dev, port 4000/5173) and the backend's own vitest suite
// (offices_app_e2e, port 4000/5173 vs 4010/5180 here) — so running this
// suite never touches or races either of those.
const BACKEND_PORT = 4010;
const DASHBOARD_PORT = 5180;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${DASHBOARD_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: sandboxChromiumAvailable ? { executablePath: SANDBOX_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../backend",
      port: BACKEND_PORT,
      timeout: 30_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "development",
        PORT: String(BACKEND_PORT),
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/offices_app_e2e",
        JWT_SECRET: "e2e-test-secret",
        APP_BASE_URL: `http://localhost:${DASHBOARD_PORT}`,
      },
    },
    {
      // The production build, not the dev server: Vite's dev server does
      // HMR over a websocket, and a stray file-watch event mid-test can
      // trigger a full page reload that looks just like (and is easily
      // confused with) a real navigation bug. VITE_API_BASE_URL is baked in
      // at build time, so it has to be set before `build`, not `preview`.
      command: `npm run build && npm run preview -- --port ${DASHBOARD_PORT} --strictPort`,
      port: DASHBOARD_PORT,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        VITE_API_BASE_URL: `http://localhost:${BACKEND_PORT}/api`,
      },
    },
  ],
});
