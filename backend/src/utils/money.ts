import { Prisma } from "@prisma/client";

export type Money = Prisma.Decimal.Value;

/**
 * quantity * unitPrice, done in exact base-10 decimal arithmetic and rounded
 * to the cent — never plain JS `*`, which drifts on values like 1.1 * 3.
 */
export function lineItemAmount(quantity: number, unitPrice: Money): Prisma.Decimal {
  return new Prisma.Decimal(unitPrice).times(quantity).toDecimalPlaces(2);
}

/** Sums a list of money amounts without binary floating-point drift. */
export function sumMoney(amounts: Money[]): Prisma.Decimal {
  return amounts.reduce((sum: Prisma.Decimal, amount) => sum.plus(amount), new Prisma.Decimal(0));
}

/** subtotal * taxRate, rounded to the nearest cent. */
export function calculateTax(subtotal: Money, taxRate: number): Prisma.Decimal {
  return new Prisma.Decimal(subtotal).times(taxRate).toDecimalPlaces(2);
}
