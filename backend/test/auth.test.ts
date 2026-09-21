import { describe, expect, it } from "vitest";
import { app, request } from "./helpers";

describe("auth", () => {
  it("registers a new organization and returns a token", async () => {
    const res = await request(app).post("/api/auth/register").send({
      organizationName: "Acme HVAC",
      name: "Alice Owner",
      email: "alice@acme.test",
      password: "password123",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe("OWNER");
    expect(res.body.user.email).toBe("alice@acme.test");
  });

  it("rejects a second registration with the same email", async () => {
    await request(app).post("/api/auth/register").send({
      organizationName: "Acme HVAC",
      name: "Alice Owner",
      email: "dupe@acme.test",
      password: "password123",
    });

    const res = await request(app).post("/api/auth/register").send({
      organizationName: "Someone Else LLC",
      name: "Bob",
      email: "dupe@acme.test",
      password: "password123",
    });

    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials and rejects wrong password", async () => {
    await request(app).post("/api/auth/register").send({
      organizationName: "Acme HVAC",
      name: "Alice Owner",
      email: "login@acme.test",
      password: "correct-password",
    });

    const good = await request(app).post("/api/auth/login").send({ email: "login@acme.test", password: "correct-password" });
    expect(good.status).toBe(200);
    expect(good.body.token).toBeTruthy();

    const bad = await request(app).post("/api/auth/login").send({ email: "login@acme.test", password: "wrong-password" });
    expect(bad.status).toBe(401);
  });

  it("rejects requests to protected routes with no token", async () => {
    const res = await request(app).get("/api/clients");
    expect(res.status).toBe(401);
  });
});
