import { describe, expect, it } from "vitest";
import { registerOwner, app, request } from "./helpers";

describe("organization settings", () => {
  it("defaults to a sane timezone for a newly registered org", async () => {
    const owner = await registerOwner();
    const res = await request(app).get("/api/organizations/me").set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe("America/New_York");
  });

  it("lets the owner update the org's timezone to a recognized IANA zone", async () => {
    const owner = await registerOwner();
    const res = await request(app)
      .put("/api/organizations/me")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ timezone: "America/Los_Angeles" });
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe("America/Los_Angeles");
  });

  it("rejects an unrecognized timezone string", async () => {
    const owner = await registerOwner();
    const res = await request(app)
      .put("/api/organizations/me")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ timezone: "Not/A_Real_Zone" });
    expect(res.status).toBe(400);
  });
});
