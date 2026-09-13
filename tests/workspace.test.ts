import test from "node:test";
import assert from "node:assert/strict";
import {
  safeNextPath,
  latestReportsPerProject,
  duplicateDocumentKey,
  isIssuedInvoice,
} from "../src/lib/workspace";
import {
  computeBillingSchedule,
  computeSCurve,
  computeProjectRiskSignals,
  invoiceOutstanding,
} from "../src/lib/workflows/calculations";

test("login preserves an internal deep link but rejects external and malformed redirects", () => {
  assert.equal(
    safeNextPath("/projects/one?tab=progress"),
    "/projects/one?tab=progress",
  );
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/login",
    "/\n/evil.test",
    null,
  ])
    assert.equal(safeNextPath(path), "/dashboard");
});
test("latest closed report does not resurrect checkpoints from an older open report", () => {
  const latest = {
    project: { id: "a" },
    inspectionDate: new Date("2026-09-12"),
    createdAt: new Date("2026-09-12"),
    open: 0,
  };
  const older = {
    project: { id: "a" },
    inspectionDate: new Date("2026-09-10"),
    createdAt: new Date("2026-09-13"),
    open: 8,
  };
  const other = { ...older, project: { id: "b" } };
  assert.deepEqual(latestReportsPerProject([older, latest, other]), [
    latest,
    other,
  ]);
});
test("same-day report revisions use creation time as a deterministic tie breaker", () => {
  const base = { project: { id: "a" }, inspectionDate: new Date("2026-09-12") };
  const first = { ...base, createdAt: new Date("2026-09-12T08:00:00Z") },
    second = { ...base, createdAt: new Date("2026-09-12T09:00:00Z") };
  assert.deepEqual(latestReportsPerProject([first, second]), [second]);
});
test("duplicate candidates remain scoped to a folder and file size", () => {
  const doc = { originalName: " Report.PDF ", fileSize: 100, folderId: "one" };
  assert.equal(
    duplicateDocumentKey(doc),
    duplicateDocumentKey({ ...doc, originalName: "report.pdf" }),
  );
  assert.notEqual(
    duplicateDocumentKey(doc),
    duplicateDocumentKey({ ...doc, folderId: "two" }),
  );
  assert.notEqual(
    duplicateDocumentKey(doc),
    duplicateDocumentKey({ ...doc, fileSize: 101 }),
  );
});
test("draft, submitted, rejected and cancelled invoices do not count as issued", () => {
  for (const s of ["DRAFT", "SUBMITTED", "REJECTED", "CANCELLED"])
    assert.equal(isIssuedInvoice(s), false);
  for (const s of ["ISSUED", "PAID", "PARTIALLY_PAID", "OVERDUE"])
    assert.equal(isIssuedInvoice(s), true);
});
test("billing schedule excludes draft and submitted invoices and respects DP amounts", () => {
  const [row] = computeBillingSchedule([
    {
      id: "p",
      number: "P",
      customer: { companyName: "Test" },
      purchaseOrders: [
        {
          id: "po",
          number: "PO",
          poValue: 1000,
          status: "VERIFIED",
          paymentTerms: null,
          estimatedDeliveryDate: new Date("2026-12-01"),
        },
      ],
      invoices: [
        { grandTotal: 1000, status: "DRAFT" },
        { grandTotal: 1000, status: "SUBMITTED" },
        { grandTotal: 1000, dpPercent: 20, status: "PAID" },
      ],
    },
  ]);
  assert.equal(row.totalInvoiced, 200);
  assert.equal(row.remainingToBill, 800);
});
test("withholding settles receivable without inflating cash received", () => {
  assert.equal(
    invoiceOutstanding({
      grandTotal: 1000,
      dpPercent: 20,
      paidAmount: 180,
      withholdingTax: 20,
    }),
    0,
  );
});
test("S curve and billing share the same issued-status rule", () => {
  const curve = computeSCurve({
    milestones: [],
    contractValue: 1000,
    invoices: [
      {
        invoiceDate: new Date("2020-01-01"),
        grandTotal: 1000,
        status: "DRAFT",
      },
      {
        invoiceDate: new Date("2020-01-01"),
        grandTotal: 1000,
        dpPercent: 20,
        status: "ISSUED",
      },
    ],
  });
  assert.equal(curve.asOfToday.billed, 20);
});
test("overdue milestones are computed without page-load database updates", () => {
  const signals = computeProjectRiskSignals({
    status: "ACTIVE",
    milestones: [
      { name: "Delivery", status: "PENDING", dueDate: new Date("2020-01-01") },
    ],
    budget: 0,
    approvedExpenseTotal: 0,
    sCurveAsOfToday: { planned: 0, actual: 0 },
  });
  assert.ok(signals.some((s) => s.type === "MILESTONE_DELAYED"));
});
test("completed projects do not generate new risk warnings", () => {
  assert.deepEqual(
    computeProjectRiskSignals({
      status: "COMPLETED",
      milestones: [
        {
          name: "Delivery",
          status: "DELAYED",
          dueDate: new Date("2020-01-01"),
        },
      ],
      budget: 10,
      approvedExpenseTotal: 100,
      sCurveAsOfToday: { planned: 100, actual: 0 },
    }),
    [],
  );
});
