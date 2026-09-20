import test from "node:test";
import assert from "node:assert/strict";
import {
  remainingBudget,
  stageProgress,
  stageState,
  mockProjectCommand,
  type CommandStage,
  type CommandStepState,
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
