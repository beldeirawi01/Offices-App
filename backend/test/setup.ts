import dotenv from "dotenv";
// override: true is required here — importing "../src/db/prisma" below pulls
// in src/config/env.ts, whose own bare dotenv.config() (loading plain .env)
// actually runs before this file's *later* statements due to how module
// evaluation order works, even though this call appears first in the
// source. Without override, an already-set key (e.g. DATABASE_URL, defined
// even as an empty string) silently wins over .env.test — which meant the
// whole suite was truncating tables in offices_app_dev, not a test database.
dotenv.config({ path: ".env.test", override: true });

import { beforeEach } from "vitest";
import { prisma } from "../src/db/prisma";

// Truncate every table between tests so each test starts from a clean slate,
// without the cost of re-running migrations per test.
beforeEach(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length > 0) {
    const names = tables.map((t) => `"${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  }
});
