import test from "node:test";
import assert from "node:assert/strict";
import {
  billingTotals,
  exactPoMatch,
  forecastMargin,
} from "../src/lib/finance-overview";
test("DP billing excludes drafts and preserves withholding settlement", () => {
  const base = {
    grandTotal: 1000,
    dpPercent: 20,
    paidAmount: 0,
    withholdingTax: 0,
  };
  assert.deepEqual(
    billingTotals([
      { ...base, status: "DRAFT" },
      { ...base, status: "APPROVED" },
      { ...base, status: "ISSUED", paidAmount: 180, withholdingTax: 20 },
      { ...base, status: "CANCELLED" },
    ]),
    { billed: 200, cash: 180, withholding: 20, outstanding: 0, drafts: 400 },
  );
});
test("PO matching never guesses suffixes or ambiguous customer references", () => {
  const orders = [{ id: "a", number: "EPC-L/2026-0450", customerId: "c" }];
  assert.equal(exactPoMatch("0450", "c", orders), null);
  assert.equal(exactPoMatch(orders[0].number, "other", orders), null);
  assert.equal(exactPoMatch(" epc-l/2026-0450 ", "c", orders), "a");
  assert.equal(
    exactPoMatch(orders[0].number, "c", [...orders, { ...orders[0], id: "b" }]),
    null,
  );
});
test("forecast exposes loss and does not invent percentage for zero sales", () => {
  assert.deepEqual(forecastMargin(100, 120), { margin: -20, percent: -20 });
  assert.deepEqual(forecastMargin(0, 120), { margin: -120, percent: null });
});
