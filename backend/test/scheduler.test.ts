import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOwner, createClient, createJob, prisma } from "./helpers";
import { sendRebookingReminders, sendReviewRequests, LOCK_KEYS } from "../src/services/scheduler.service";

afterEach(() => {
  vi.useRealTimers();
});

describe("sendReviewRequests", () => {
  it("sends a review request once the configured delay has passed and marks it sent", async () => {
    // Only these send-type jobs act during their org's target local hour
    // (10am for review requests) — pin the clock there, in UTC, so this
    // test doesn't depend on what time it actually is when it runs.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { reviewRequestEnabled: true, reviewRequestDelayDays: 3, reviewLinkUrl: "https://g.page/r/example", timezone: "UTC" },
    });
    const client = await createClient(owner.token, { name: "Review client", email: "review@test.com" });
    const jobRes = await createJob(owner.token, client.id);

    const paidAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: owner.user.organizationId,
        clientId: client.id,
        jobId: jobRes.body.id,
        invoiceNumber: `INV-TEST-${Date.now()}`,
        status: "PAID",
        total: 100,
        paidAt,
      },
    });

    await sendReviewRequests();

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.reviewRequestSentAt).not.toBeNull();
  });

  it("does not send outside its org's target local hour, even if otherwise due", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T14:00:00.000Z")); // 2pm UTC, not the 10am target hour

    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { reviewRequestEnabled: true, reviewRequestDelayDays: 3, reviewLinkUrl: "https://g.page/r/example", timezone: "UTC" },
    });
    const client = await createClient(owner.token, { name: "Wrong hour client", email: "wronghour@test.com" });

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: owner.user.organizationId,
        clientId: client.id,
        invoiceNumber: `INV-TEST-${Date.now()}`,
        status: "PAID",
        total: 100,
        paidAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
    });

    await sendReviewRequests();

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.reviewRequestSentAt).toBeNull();
  });

  it("does not send before the configured delay has elapsed", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { reviewRequestEnabled: true, reviewRequestDelayDays: 3, reviewLinkUrl: "https://g.page/r/example" },
    });
    const client = await createClient(owner.token, { name: "Too soon client", email: "toosoon@test.com" });

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: owner.user.organizationId,
        clientId: client.id,
        invoiceNumber: `INV-TEST-${Date.now()}`,
        status: "PAID",
        total: 100,
        paidAt: new Date(),
      },
    });

    await sendReviewRequests();

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.reviewRequestSentAt).toBeNull();
  });

  it("skips a client who has opted out of follow-ups", async () => {
    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { reviewRequestEnabled: true, reviewRequestDelayDays: 3, reviewLinkUrl: "https://g.page/r/example" },
    });
    const client = await createClient(owner.token, { name: "Opted out client", email: "optedout@test.com" });
    await prisma.client.update({ where: { id: client.id }, data: { followUpsEnabled: false } });

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: owner.user.organizationId,
        clientId: client.id,
        invoiceNumber: `INV-TEST-${Date.now()}`,
        status: "PAID",
        total: 100,
        paidAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });

    await sendReviewRequests();

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.reviewRequestSentAt).toBeNull();
  });

  it("skips this run if another instance already holds the job's advisory lock", async () => {
    // Pinned to the target hour so that, absent the lock, this candidate
    // would otherwise be sent — proving the skip below is really the lock
    // and not just the wrong hour.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const owner = await registerOwner();
    await prisma.organization.update({
      where: { id: owner.user.organizationId },
      data: { reviewRequestEnabled: true, reviewRequestDelayDays: 3, reviewLinkUrl: "https://g.page/r/example", timezone: "UTC" },
    });
    const client = await createClient(owner.token, { name: "Locked-out client", email: "lockedout@test.com" });

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: owner.user.organizationId,
        clientId: client.id,
        invoiceNumber: `INV-TEST-${Date.now()}`,
        status: "PAID",
        total: 100,
        paidAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });

    // Simulate a second backend instance already mid-run: hold the same
    // advisory lock open on its own connection until we release it below.
    let signalAcquired!: () => void;
    const lockAcquired = new Promise<void>((resolve) => (signalAcquired = resolve));
    let releaseLock!: () => void;
    const releaseGate = new Promise<void>((resolve) => (releaseLock = resolve));

    const holding = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${LOCK_KEYS.sendReviewRequests}) AS locked`;
      signalAcquired();
      await releaseGate;
    });

    await lockAcquired;
    await sendReviewRequests();
    releaseLock();
    await holding;

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.reviewRequestSentAt).toBeNull();
  });
});

describe("sendRebookingReminders", () => {
  it("sends a rebooking reminder once a job's recurrence interval has passed", async () => {
    // Target local hour for rebooking reminders is 11am — pin the clock
    // there in UTC so this doesn't depend on the real time of day.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T11:00:00.000Z"));

    const owner = await registerOwner();
    await prisma.organization.update({ where: { id: owner.user.organizationId }, data: { timezone: "UTC" } });
    const client = await createClient(owner.token, { name: "Rebook client", email: "rebook@test.com" });
    const jobRes = await createJob(owner.token, client.id, { recurrenceIntervalMonths: 6 });

    const completedAt = new Date();
    completedAt.setMonth(completedAt.getMonth() - 7);
    await prisma.job.update({
      where: { id: jobRes.body.id },
      data: { status: "COMPLETED", completedAt },
    });

    await sendRebookingReminders();

    const updated = await prisma.job.findUniqueOrThrow({ where: { id: jobRes.body.id } });
    expect(updated.rebookingReminderSentAt).not.toBeNull();
  });

  it("does not send before the recurrence interval has passed", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Not due client", email: "notdue@test.com" });
    const jobRes = await createJob(owner.token, client.id, { recurrenceIntervalMonths: 6 });

    const completedAt = new Date();
    completedAt.setMonth(completedAt.getMonth() - 1);
    await prisma.job.update({
      where: { id: jobRes.body.id },
      data: { status: "COMPLETED", completedAt },
    });

    await sendRebookingReminders();

    const updated = await prisma.job.findUniqueOrThrow({ where: { id: jobRes.body.id } });
    expect(updated.rebookingReminderSentAt).toBeNull();
  });
});
