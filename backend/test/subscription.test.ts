import { describe, expect, it } from "vitest";
import { registerOwner, createClient, app, request, prisma } from "./helpers";
import { mapStripeSubscriptionStatus } from "../src/services/payment.service";

describe("registration starts a 14-day trial", () => {
  it("sets subscriptionStatus TRIALING and a trialEndsAt ~14 days out", async () => {
    const owner = await registerOwner();
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: owner.user.organizationId } });

    expect(org.subscriptionStatus).toBe("TRIALING");
    expect(org.trialEndsAt).not.toBeNull();
    const daysOut = (org.trialEndsAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(13);
    expect(daysOut).toBeLessThan(15);
  });
});

describe("requireActiveSubscription", () => {
  it("allows access during an active trial", async () => {
    const owner = await registerOwner();
    const res = await request(app).get("/api/clients").set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
  });

  it("blocks access once the trial has expired with no paid subscription", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const res = await request(app).get("/api/clients").set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(402);
  });

  it("allows access once subscriptionStatus is ACTIVE, even past trialEndsAt", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), subscriptionStatus: "ACTIVE" },
    });

    const res = await request(app).get("/api/clients").set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
  });

  it("allows access while PAST_DUE (Stripe's own retry grace period)", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), subscriptionStatus: "PAST_DUE" },
    });

    const res = await request(app).get("/api/clients").set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
  });

  it("blocks access once subscriptionStatus is CANCELED", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { subscriptionStatus: "CANCELED" },
    });

    const res = await request(app).get("/api/clients").set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(402);
  });

  it("grandfathers in an org with no trialEndsAt at all", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { trialEndsAt: null },
    });

    const res = await request(app).get("/api/clients").set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
  });

  it("blocks jobs, invoices, quotes, and reports the same way clients is blocked", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { subscriptionStatus: "CANCELED" },
    });

    const jobs = await request(app).get("/api/jobs").set("Authorization", `Bearer ${owner.token}`);
    const invoices = await request(app).get("/api/invoices").set("Authorization", `Bearer ${owner.token}`);
    const quotes = await request(app).get("/api/quotes").set("Authorization", `Bearer ${owner.token}`);
    const reports = await request(app).get("/api/reports/summary").set("Authorization", `Bearer ${owner.token}`);
    const createJobAttempt = await request(app)
      .post("/api/jobs")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ clientId: client.id, title: "Blocked job" });

    expect(jobs.status).toBe(402);
    expect(invoices.status).toBe(402);
    expect(quotes.status).toBe(402);
    expect(reports.status).toBe(402);
    expect(createJobAttempt.status).toBe(402);
  });
});

describe("mapStripeSubscriptionStatus", () => {
  it("maps Stripe's statuses onto our own enum", () => {
    expect(mapStripeSubscriptionStatus("trialing")).toBe("TRIALING");
    expect(mapStripeSubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("CANCELED");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("CANCELED");
    expect(mapStripeSubscriptionStatus("incomplete")).toBe("INCOMPLETE");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("INCOMPLETE");
  });
});
