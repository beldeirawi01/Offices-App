import dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

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
