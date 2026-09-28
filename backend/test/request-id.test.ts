import { describe, expect, it } from "vitest";
import { app, request } from "./helpers";

describe("request id", () => {
  it("sets X-Request-Id on every response, generating one if the client didn't send one", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("echoes back a client-supplied X-Request-Id instead of generating a new one", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "test-fixed-id-123");
    expect(res.headers["x-request-id"]).toBe("test-fixed-id-123");
  });

  it("includes the request id in an error response body", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "not-an-email", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });
});
