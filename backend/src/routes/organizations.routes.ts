import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, requireOwner } from "../middleware/auth";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

organizationsRouter.get("/me", async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });
  res.json(org);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  // Stored as a decimal fraction (0.0825 = 8.25%), but the dashboard sends/
  // shows it as a percentage — converted at the API boundary, not in the DB.
  taxRatePercent: z.number().min(0).max(100).optional(),
});

organizationsRouter.put("/me", requireOwner, async (req, res) => {
  const body = updateSchema.parse(req.body);
  const org = await prisma.organization.update({
    where: { id: req.auth!.organizationId },
    data: {
      name: body.name,
      taxRate: body.taxRatePercent != null ? body.taxRatePercent / 100 : undefined,
    },
  });
  res.json(org);
});
