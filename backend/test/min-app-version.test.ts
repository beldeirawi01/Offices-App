import { afterEach, describe, expect, it, vi } from "vitest";
import { app, request } from "./helpers";

describe("minimum app version gate (no MOBILE_MIN_VERSION configured)", () => {
  it("does not affect a request with no X-App-Version header (the dashboard)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).not.toBe(426);
  });

  it("allows any mobile request since no minimum is configured (defaults to 0.0.0)", async () => {
    const res = await request(app).get("/health").set("X-App-Version", "0.0.1");
    expect(res.status).not.toBe(426);
  });
});

describe("minAppVersion middleware logic", () => {
  const originalMinVersion = process.env.MOBILE_MIN_VERSION;

  afterEach(() => {
    if (originalMinVersion === undefined) delete process.env.MOBILE_MIN_VERSION;
    else process.env.MOBILE_MIN_VERSION = originalMinVersion;
    vi.resetModules();
  });

  async function loadMiddleware(minVersion: string) {
    vi.resetModules();
    process.env.MOBILE_MIN_VERSION = minVersion;
    const mod = await import("../src/middleware/minAppVersion");
    return mod.minAppVersion;
  }

  function mockResponse() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  it("blocks a client version older than the configured minimum", async () => {
    const minAppVersion = await loadMiddleware("2.0.0");
    const res = mockResponse();
    const next = vi.fn();

    minAppVersion({ headers: { "x-app-version": "1.5.0" } } as any, res, next);

    expect(res.status).toHaveBeenCalledWith(426);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a client version equal to or newer than the minimum", async () => {
    const minAppVersion = await loadMiddleware("2.0.0");

    const nextEqual = vi.fn();
    minAppVersion({ headers: { "x-app-version": "2.0.0" } } as any, mockResponse(), nextEqual);
    expect(nextEqual).toHaveBeenCalledTimes(1);

    const nextNewer = vi.fn();
    minAppVersion({ headers: { "x-app-version": "2.1.0" } } as any, mockResponse(), nextNewer);
    expect(nextNewer).toHaveBeenCalledTimes(1);
  });

  it("compares version segments numerically, not lexicographically", async () => {
    // A naive string comparison would say "1.10.0" < "1.2.0" (since "1" < "2"
    // at that character position) — the real comparison must treat 10 > 2.
    const minAppVersion = await loadMiddleware("1.2.0");
    const next = vi.fn();

    minAppVersion({ headers: { "x-app-version": "1.10.0" } } as any, mockResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
