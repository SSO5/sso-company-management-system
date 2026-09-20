import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProjectCommand,
  daysRemaining,
  loadProjectCommand,
  looksLikeProjectId,
  remainingBudget,
  stageProgress,
  stageState,
  mockProjectCommand,
  type CommandStage,
  type CommandStepState,
  type ProjectCommandInput,
} from "../src/lib/project-command";

const stage = (...states: CommandStepState[]): CommandStage => ({
  key: "EXECUTION",
  title: "Pelaksanaan",
  caption: "uji",
  steps: states.map((state, i) => ({ label: `langkah ${i + 1}`, state })),
});

test("satu langkah tertahan mengalahkan langkah lain yang sudah selesai", () => {
  // Inilah alasan urutannya dibalik: tahap yang hampir selesai tapi punya
  // satu langkah tertahan tetap harus terbaca tertahan.
  assert.equal(stageState(stage("DONE", "DONE", "DONE", "BLOCKED")), "BLOCKED");
});

test("tahap baru disebut selesai kalau semua langkahnya selesai", () => {
  assert.equal(stageState(stage("DONE", "DONE")), "DONE");
  assert.equal(stageState(stage("DONE", "ACTIVE")), "ACTIVE");
  assert.equal(stageState(stage("DONE", "TODO")), "ACTIVE");
});

test("tahap yang belum disentuh sama sekali berstatus TODO", () => {
  assert.equal(stageState(stage("TODO", "TODO")), "TODO");
  assert.equal(stageState(stage()), "TODO");
});

test("stageProgress menghitung persen langkah selesai, bukan langkah berjalan", () => {
  assert.equal(stageProgress(stage("DONE", "DONE", "ACTIVE", "TODO")), 50);
  assert.equal(stageProgress(stage("ACTIVE", "ACTIVE")), 0);
  assert.equal(stageProgress(stage()), 0);
});

test("data tiruan memuat keempat tahap dalam urutan alur kerja", () => {
  const data = mockProjectCommand("proyek-uji");
  assert.deepEqual(
    data.stages.map((s) => s.key),
    ["COMMERCIAL", "PROCUREMENT", "EXECUTION", "CONTROL"],
  );
  // Selama masih tiruan, halaman wajib bisa mengakuinya.
  assert.equal(data.isMock, true);
});

test("sisa pagu ikut memotong komitmen, bukan hanya biaya yang disetujui", () => {
  // PO vendor terkirim adalah uang yang praktis sudah habis. Kalau tidak
  // dipotong, proyek terlihat lebih longgar daripada keadaannya.
  assert.equal(
    remainingBudget({ budget: 100, actualCost: 60, committedCost: 30 }),
    10,
  );
});

test("sisa pagu negatif berarti sudah lewat pagu", () => {
  assert.equal(
    remainingBudget({ budget: 100, actualCost: 90, committedCost: 30 }),
    -20,
  );
});

test("alamat yang jelas bukan id proyek ditolak sebelum data dicari", () => {
  assert.equal(looksLikeProjectId("clx8n2k4p0001qw3f7yz9abcd"), true);
  assert.equal(looksLikeProjectId(""), false);
  assert.equal(looksLikeProjectId("   "), false);
  assert.equal(looksLikeProjectId("123"), false);
  assert.equal(looksLikeProjectId("../../etc/passwd"), false);
  assert.equal(looksLikeProjectId(undefined), false);
});

test("loadProjectCommand mengembalikan null untuk proyek yang tidak ada", async () => {
  // Halaman memanggil notFound() pada null. Tanpa ini, alamat proyek yang
  // salah akan menampilkan layar penuh angka tiruan seolah itu data nyata.
  assert.equal(await loadProjectCommand("bukan-id"), null);
  const ada = await loadProjectCommand("clx8n2k4p0001qw3f7yz9abcd");
  assert.notEqual(ada, null);
  assert.equal(ada?.projectId, "clx8n2k4p0001qw3f7yz9abcd");
});

/* --- penyusun data nyata --- */

const hariLalu = (n: number) => new Date(Date.now() - n * 86_400_000);
const hariDepan = (n: number) => new Date(Date.now() + n * 86_400_000);

const inputDasar = (): ProjectCommandInput => ({
  project: {
    id: "clx8n2k4p0001qw3f7yz9abcd",
    number: "012/PRJ/OPS/IX/2026",
    name: "Proyek Uji",
    jobNumber: "JOB-1",
    status: "ACTIVE",
    startDate: hariLalu(60),
    endDate: hariDepan(30),
    contractValue: 1_000_000_000,
    budget: 800_000_000,
    progressPercent: 0,
    customerName: "PT Uji",
    projectManagerName: "Budi",
  },
  milestones: [],
  cost: { actualCost: 0, committedCost: 0, pendingCost: 0, forecastCost: 800_000_000 },
  opportunity: null,
  costing: null,
  quotation: null,
  customerPurchaseOrders: [],
  vendorPurchaseOrders: [],
  billing: { totalInvoiced: 0, totalPaid: 0, invoiceCount: 0 },
  documentCount: 0,
  riskMessages: [],
  weeklyReportCount: 0,
  now: new Date(),
});

test("sisa hari null saat tanggal selesai belum diisi", () => {
  const now = new Date("2026-09-20T00:00:00Z");
  assert.equal(daysRemaining(null, now), null);
  assert.equal(daysRemaining(new Date("2026-09-30T00:00:00Z"), now), 10);
  assert.equal(daysRemaining(new Date("2026-09-10T00:00:00Z"), now), -10);
});

test("milestone lewat tanggal menjadi langkah tertahan, bukan sekadar catatan", () => {
  const input = inputDasar();
  input.milestones = [
    { name: "Uji fungsi", status: "IN_PROGRESS", dueDate: hariLalu(8), completedAt: null, weightPercent: 50 },
    { name: "Kirim material", status: "COMPLETED", dueDate: hariLalu(20), completedAt: hariLalu(19), weightPercent: 50 },
  ];
  const data = buildProjectCommand(input);
  const eksekusi = data.stages.find((s) => s.key === "EXECUTION")!;
  assert.equal(stageState(eksekusi), "BLOCKED");
  assert.ok(eksekusi.steps.some((s) => s.detail?.includes("Uji fungsi")));
});

test("tanpa PO pelanggan, tahap komersial ditandai tertahan", () => {
  // Tanpa PO pelanggan dasar penagihan belum lengkap — itu bukan detail
  // administratif, itu yang menahan uang masuk.
  const data = buildProjectCommand(inputDasar());
  const komersial = data.stages.find((s) => s.key === "COMMERCIAL")!;
  assert.equal(stageState(komersial), "BLOCKED");
});

test("biaya menunggu persetujuan menahan tahap kendali", () => {
  const input = inputDasar();
  input.cost.pendingCost = 46_500_000;
  const data = buildProjectCommand(input);
  const kendali = data.stages.find((s) => s.key === "CONTROL")!;
  assert.equal(stageState(kendali), "BLOCKED");
  assert.equal(data.snapshot.pendingCost, 46_500_000);
});

test("data nyata tidak pernah menandai dirinya tiruan", () => {
  const data = buildProjectCommand(inputDasar());
  assert.equal(data.isMock, false);
  assert.equal(data.projectId, "clx8n2k4p0001qw3f7yz9abcd");
});

test("pesan risiko dipakai apa adanya, tidak ditulis ulang", () => {
  // Kalau Command Center mengarang kalimatnya sendiri, ia akan berbeda dari
  // peringatan di halaman detail proyek untuk proyek yang sama.
  const input = inputDasar();
  input.riskMessages = ["Perkiraan margin turun 7 poin dari rencana"];
  assert.deepEqual(buildProjectCommand(input).attention, input.riskMessages);
});
