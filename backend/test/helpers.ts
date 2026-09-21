import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/db/prisma";

export async function registerOwner(overrides: Partial<{ organizationName: string; name: string; email: string; password: string }> = {}) {
  const body = {
    organizationName: overrides.organizationName ?? "Test Trades Co",
    name: overrides.name ?? "Owner",
    email: overrides.email ?? `owner-${Date.now()}-${Math.random()}@test.com`,
    password: overrides.password ?? "password123",
  };
  const res = await request(app).post("/api/auth/register").send(body);
  if (res.status !== 201) throw new Error(`registerOwner failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, user: res.body.user, body };
}

export async function createClient(token: string, overrides: Partial<{ name: string; email: string; phone: string }> = {}) {
  const res = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: overrides.name ?? "Jane Client", email: overrides.email, phone: overrides.phone });
  if (res.status !== 201) throw new Error(`createClient failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function createJob(token: string, clientId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${token}`)
    .send({ clientId, title: "Test job", ...overrides });
  return res;
}

export { prisma, app, request };
