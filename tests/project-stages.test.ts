import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectStages, STAGE_ORDER, type StageInput } from "../src/lib/project-stages";
import { stageState } from "../src/lib/project-command";

const hariLalu = (n: number) => new Date(Date.now() - n * 86_400_000);
const hariDepan = (n: number) => new Date(Date.now() + n * 86_400_000);

const dasar = (): StageInput => ({
  projectId: "clx8n2k4p0001qw3f7yz9abcd",
  budget: 800_000_000,
  contractValue: 1_000_000_000,
  cost: { actualCost: 0, committedCost: 0, pendingCost: 0 },
  milestones: [],
  opportunity: null,
  costing: null,
  quotation: null,
  customerPurchaseOrders: [],
  vendorPurchaseOrders: [],
  billing: { totalInvoiced: 0, totalPaid: 0 },
  weeklyReportCount: 0,
  now: new Date(),
});

const stage = (input: StageInput, key: string) =>
  buildProjectStages(input).find((s) => s.key === key)!;

test("empat tahap selalu ada dalam urutan alur kerja", () => {
  assert.deepEqual(
    buildProjectStages(dasar()).map((s) => s.key),
    STAGE_ORDER,
  );
});

test("tanpa PO pelanggan, tahap komersial tertahan", () => {
  // Bukan detail administratif: tanpa PO pelanggan, dasar penagihan belum
  // lengkap dan uang tidak bisa masuk.
  assert.equal(stageState(stage(dasar(), "COMMERCIAL")), "BLOCKED");

  const dengan = dasar();
  dengan.opportunity = { number: "OPP-1", status: "WON" };
  dengan.costing = { number: "CST-1", status: "FINAL" };
  dengan.quotation = { number: "QUO-1", status: "WON" };
  dengan.customerPurchaseOrders = [{ number: "PO-1", poValue: 1_000_000_000 }];
  assert.equal(stageState(stage(dengan, "COMMERCIAL")), "DONE");
});

test("penawaran yang masih diproses berstatus berjalan, bukan selesai", () => {
  const i = dasar();
  i.quotation = { number: "QUO-1", status: "SUBMITTED" };
  const langkah = stage(i, "COMMERCIAL").steps.find((s) => s.label === "Penawaran")!;
  assert.equal(langkah.state, "ACTIVE");

  i.quotation = { number: "QUO-1", status: "WON" };
  assert.equal(
    stage(i, "COMMERCIAL").steps.find((s) => s.label === "Penawaran")!.state,
    "DONE",
  );
});

test("hanya PO vendor yang sudah keluar kantor dihitung terkirim", () => {
  const i = dasar();
  i.vendorPurchaseOrders = [
    { number: "VPO-1", status: "SENT", grandTotal: 100 },
    { number: "VPO-2", status: "CONFIRMED", grandTotal: 200 },
    { number: "VPO-3", status: "DRAFT", grandTotal: 400 },
    { number: "VPO-4", status: "CANCELLED", grandTotal: 800 },
  ];
  const langkah = stage(i, "PROCUREMENT").steps;
  assert.match(langkah[0].detail!, /2 PO/);
  // Yang dibatalkan tidak dihitung menggantung; yang draf dihitung.
  assert.match(langkah[1].detail!, /1 PO/);
});

test("milestone lewat tanggal menahan tahap pelaksanaan dan disebut namanya", () => {
  const i = dasar();
  i.milestones = [
    { name: "Uji fungsi panel", dueDate: hariLalu(8), completedAt: null },
    { name: "Kirim material", dueDate: hariLalu(30), completedAt: hariLalu(29) },
  ];
  const tahap = stage(i, "EXECUTION");
  assert.equal(stageState(tahap), "BLOCKED");
  assert.ok(tahap.steps.some((s) => s.detail?.includes("Uji fungsi panel")));
});

test("milestone yang belum jatuh tempo tidak dianggap terlambat", () => {
  const i = dasar();
  i.milestones = [{ name: "Uji fungsi", dueDate: hariDepan(5), completedAt: null }];
  assert.notEqual(stageState(stage(i, "EXECUTION")), "BLOCKED");
});

test("biaya menunggu persetujuan menahan tahap kendali", () => {
  const i = dasar();
  i.cost.pendingCost = 46_500_000;
  assert.equal(stageState(stage(i, "CONTROL")), "BLOCKED");
});

test("tanpa pagu, langkah biaya tidak berpura-pura punya pembanding", () => {
  const i = dasar();
  i.budget = 0;
  i.cost.actualCost = 5_000_000;
  const langkah = stage(i, "CONTROL").steps.find((s) => s.label === "Biaya disetujui")!;
  assert.match(langkah.detail!, /pagu belum ditetapkan/);
});

test("setiap langkah yang bisa ditindak punya tujuan", () => {
  const i = dasar();
  i.milestones = [{ name: "Uji", dueDate: hariLalu(1), completedAt: null }];
  i.cost.pendingCost = 1_000;
  for (const tahap of buildProjectStages(i)) {
    for (const langkah of tahap.steps) {
      if (langkah.state === "BLOCKED") {
        assert.ok(langkah.href, `langkah tertahan tanpa tujuan: ${langkah.label}`);
      }
    }
  }
});
