import { describe, expect, it } from "vitest";
import { lineItemAmount, sumMoney, calculateTax } from "../src/utils/money";

describe("money utilities", () => {
  it("sums amounts exactly where plain JS float addition would drift", () => {
    // Textbook float trap: 0.1 + 0.2 + 0.3 !== 0.6 in IEEE 754 double
    // precision (it's 0.6000000000000001). This is exactly the class of bug
    // a hallucinated-looking-fine-but-wrong invoice total comes from.
    expect(0.1 + 0.2 + 0.3).not.toBe(0.6);

    const sum = sumMoney([0.1, 0.2, 0.3]);
    expect(sum.toNumber()).toBe(0.6);
  });

  it("computes a line item amount exactly where plain JS multiplication would drift", () => {
    // 1.005 * 100 in plain float is 100.49999999999999, not 100.5.
    expect(1.005 * 100).not.toBe(100.5);

    const amount = lineItemAmount(100, 1.005);
    expect(amount.toNumber()).toBe(100.5);
  });

  it("rounds tax to the nearest cent instead of carrying binary float noise", () => {
    const tax = calculateTax(19.99, 0.0825);
    // 19.99 * 0.0825 = 1.649175 -> rounds to $1.65, not a value like
    // 1.6491749999999998 that would then silently propagate into the total.
    expect(tax.toNumber()).toBe(1.65);
  });
});
