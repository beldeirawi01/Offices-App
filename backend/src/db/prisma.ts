import { PrismaClient, Prisma } from "@prisma/client";

// Money fields are Prisma Decimal (never Float — see schema.prisma), but
// Decimal's default toJSON() returns a string (e.g. "149.99"), which would
// silently change every API response's field type out from under the
// dashboard/mobile clients, which expect a number. Patched globally, once,
// rather than converting at every route that returns an invoice/quote/line
// item/payment.
(Prisma.Decimal.prototype as unknown as { toJSON(): number }).toJSON = function (this: Prisma.Decimal) {
  return this.toNumber();
};

export const prisma = new PrismaClient();
