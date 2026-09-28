import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/subscription";
import { sumMoney } from "../utils/money";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);
reportsRouter.use(requireActiveSubscription);

// Owner dashboard summary: revenue, outstanding balances, job-type mix, busiest days.
reportsRouter.get("/summary", async (req, res) => {
  const organizationId = req.auth!.organizationId;

  const [paidInvoices, outstandingInvoices, jobs] = await Promise.all([
    prisma.invoice.findMany({ where: { organizationId, status: "PAID" } }),
    prisma.invoice.findMany({ where: { organizationId, status: { in: ["SENT", "OVERDUE"] } } }),
    prisma.job.findMany({ where: { organizationId }, select: { jobType: true, scheduledAt: true, status: true } }),
  ]);

  const totalRevenue = sumMoney(paidInvoices.map((inv) => inv.total));
  const outstandingBalance = sumMoney(outstandingInvoices.map((inv) => inv.total));

  const revenueByMonth = new Map<string, Prisma.Decimal>();
  for (const invoice of paidInvoices) {
    const key = invoice.paidAt
      ? `${invoice.paidAt.getFullYear()}-${String(invoice.paidAt.getMonth() + 1).padStart(2, "0")}`
      : "unknown";
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? new Prisma.Decimal(0)).plus(invoice.total));
  }

  const jobTypeBreakdown = new Map<string, number>();
  for (const job of jobs) {
    const key = job.jobType ?? "Uncategorized";
    jobTypeBreakdown.set(key, (jobTypeBreakdown.get(key) ?? 0) + 1);
  }

  const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
  for (const job of jobs) {
    if (job.scheduledAt) {
      dayCounts[job.scheduledAt.getDay()] += 1;
    }
  }
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const busiestDays = dayNames.map((name, i) => ({ day: name, jobCount: dayCounts[i] }));

  res.json({
    totalRevenue,
    outstandingBalance,
    paidInvoiceCount: paidInvoices.length,
    outstandingInvoiceCount: outstandingInvoices.length,
    revenueByMonth: Array.from(revenueByMonth.entries()).map(([month, total]) => ({ month, total })),
    jobTypeBreakdown: Array.from(jobTypeBreakdown.entries()).map(([jobType, count]) => ({ jobType, count })),
    busiestDays,
    jobStatusCounts: {
      scheduled: jobs.filter((j) => j.status === "SCHEDULED").length,
      inProgress: jobs.filter((j) => j.status === "IN_PROGRESS").length,
      completed: jobs.filter((j) => j.status === "COMPLETED").length,
      cancelled: jobs.filter((j) => j.status === "CANCELLED").length,
    },
  });
});
