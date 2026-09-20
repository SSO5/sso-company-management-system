import test from "node:test";
import assert from "node:assert/strict";
import {
  budgetDrift,
  canBecomeBaseline,
  isLocked,
  loadProjectBaseline,
  mockProjectBaseline,
  sumBaselineLines,
  unmappedBaselineLines,
  type BaselineVersion,
} from "../src/lib/project-baseline";

const id = "clx8n2k4p0001qw3f7yz9abcd";

test("costing draf tidak boleh dijadikan baseline", () => {
  // Costing DRAFT masih bisa berubah malam ini juga; membekukan angka yang
  // masih bergerak sama saja dengan tidak membekukan apa pun.
  assert.equal(canBecomeBaseline({ status: "DRAFT" }), false);
  assert.equal(canBecomeBaseline({ status: "FINAL" }), true);
  assert.equal(canBecomeBaseline({ status: "CONVERTED" }), true);
});

test("selisih pagu proyek terhadap baseline dilaporkan, bukan disembunyikan", () => {
  // Papan biaya membandingkan realisasi dengan Project.budget, sementara
  // orang mengira yang dipakai baseline. Selisihnya harus terlihat.
  const d = mockProjectBaseline(id);
  const drift = budgetDrift(d);
  assert.notEqual(drift, null);
  assert.equal(drift, d.projectBudget - d.current!.amount);
});

test("proyek tanpa baseline tidak menghasilkan selisih palsu", () => {
  assert.equal(budgetDrift({ projectBudget: 500, current: null }), null);
});

test("nilai baseline selalu sama dengan jumlah barisnya", () => {
  // Kalau total dan rinciannya bisa berbeda, baseline berhenti jadi
  // pembanding yang bisa dipercaya.
  for (const v of mockProjectBaseline(id).history) {
    assert.equal(v.amount, sumBaselineLines(v.lines), `versi ${v.version}`);
  }
});

test("baris tanpa jenis biaya dikenali sebagai pekerjaan tertunda", () => {
  const d = mockProjectBaseline(id);
  const belum = unmappedBaselineLines(d.current!.lines);
  assert.ok(belum.length > 0);
  assert.ok(belum.every((l) => l.costTypeCode === null));
});

test("terkunci hanya kalau tanggal penguncian benar-benar ada", () => {
  const dasar = mockProjectBaseline(id).current!;
  assert.equal(isLocked(dasar), true);
  const belum: BaselineVersion = { ...dasar, lockedAt: null, lockedBy: null };
  assert.equal(isLocked(belum), false);
  assert.equal(isLocked(null), false);
});

test("riwayat diurutkan dari versi terbaru", () => {
  const h = mockProjectBaseline(id).history;
  assert.deepEqual(
    h.map((v) => v.version),
    [...h.map((v) => v.version)].sort((a, b) => b - a),
  );
  // Versi yang berlaku adalah yang paling baru.
  assert.equal(mockProjectBaseline(id).current!.version, h[0].version);
});

test("alamat yang bukan id proyek tidak menghasilkan baseline", async () => {
  assert.equal(await loadProjectBaseline("bukan-id"), null);
  assert.notEqual(await loadProjectBaseline(id), null);
});
