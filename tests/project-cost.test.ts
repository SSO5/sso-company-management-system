import test from "node:test";
import assert from "node:assert/strict";
import { summarizeProjectCost } from "../src/lib/project-cost";

const exp = (total: number, approvalStatus: string, paymentStatus = "UNPAID") => ({
  total,
  approvalStatus,
  paymentStatus,
});

test("only approved expenses become actual cost", () => {
  const r = summarizeProjectCost(
    [
      exp(1_000_000, "APPROVED", "PAID"),
      exp(500_000, "DRAFT"),
      exp(300_000, "SUBMITTED"),
      exp(9_000_000, "REJECTED"),
    ],
    [],
    0,
  );
  // The rejected 9jt is the whole point: before this filter existed it was
  // silently eating the project's margin.
  assert.equal(r.actualCost, 1_000_000);
  assert.equal(r.pendingCost, 800_000);
});

test("payable counts approved-but-unpaid only", () => {
  const r = summarizeProjectCost(
    [
      exp(1_000_000, "APPROVED", "PAID"),
      exp(250_000, "APPROVED", "UNPAID"),
      exp(700_000, "SUBMITTED", "UNPAID"),
      exp(400_000, "REJECTED", "UNPAID"),
    ],
    [],
    0,
  );
  assert.equal(r.actualCost, 1_250_000);
  assert.equal(r.payable, 250_000);
});

test("a sent vendor PO is committed, not actual, until its expense is approved", () => {
  const r = summarizeProjectCost(
    [],
    [
      { grandTotal: 40_000_000, expense: null },
      { grandTotal: 15_000_000, expense: { approvalStatus: "SUBMITTED" } },
      { grandTotal: 25_000_000, expense: { approvalStatus: "APPROVED" } },
    ],
    0,
  );
  // The approved one already counts through its ProjectExpense row, so
  // counting it here too would double it.
  assert.equal(r.committedCost, 55_000_000);
  assert.equal(r.actualCost, 0);
});

test("forecast holds at budget until spend passes it, then follows the spend", () => {
  const under = summarizeProjectCost([exp(30_000_000, "APPROVED")], [], 100_000_000);
  assert.equal(under.forecastCost, 100_000_000);

  const over = summarizeProjectCost(
    [exp(90_000_000, "APPROVED")],
    [{ grandTotal: 25_000_000, expense: null }],
    100_000_000,
  );
  assert.equal(over.forecastCost, 115_000_000);
});

test("Prisma Decimal values are coerced, not concatenated", () => {
  // Prisma returns Decimal objects, not numbers. Adding those with + would
  // silently produce "0500000250000" instead of a sum.
  const dec = (v: string) => ({ toString: () => v, valueOf: () => Number(v) });
  const r = summarizeProjectCost(
    [{ total: dec("500000"), approvalStatus: "APPROVED", paymentStatus: "UNPAID" }],
    [{ grandTotal: dec("250000"), expense: null }],
    0,
  );
  assert.equal(r.actualCost, 500_000);
  assert.equal(r.committedCost, 250_000);
  assert.equal(r.forecastCost, 750_000);
});

test("an empty project reports zeroes, not NaN", () => {
  const r = summarizeProjectCost([], [], 0);
  assert.deepEqual(r, {
    actualCost: 0,
    payable: 0,
    pendingCost: 0,
    committedCost: 0,
    forecastCost: 0,
  });
});
