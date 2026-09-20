import test from "node:test";
import assert from "node:assert/strict";
import {
  BASELINE_NEAR_LIMIT_PERCENT,
  consumedPercent,
  forecastAtCompletion,
  loadCostBoard,
  mockCostBoard,
  varianceStatus,
  varianceToBaseline,
} from "../src/lib/project-cost-board";

test("perkiraan bertahan di baseline sampai belanja melewatinya", () => {
  assert.equal(
    forecastAtCompletion({ baseline: 100, actual: 30, committed: 20 }),
    100,
  );
  assert.equal(
    forecastAtCompletion({ baseline: 100, actual: 90, committed: 25 }),
    115,
  );
});

test("selisih positif berarti hemat, negatif berarti lewat baseline", () => {
  assert.equal(varianceToBaseline({ baseline: 100, actual: 30, committed: 20 }), 0);
  assert.equal(varianceToBaseline({ baseline: 100, actual: 90, committed: 25 }), -15);
});

test("komitmen ikut dihitung sebagai baseline terpakai", () => {
  // PO vendor terkirim adalah uang yang praktis sudah habis. Menghitung
  // penyerapan tanpa komitmen membuat proyek terlihat lebih longgar.
  assert.equal(consumedPercent({ baseline: 200, actual: 100, committed: 50 }), 75);
  assert.equal(consumedPercent({ baseline: 0, actual: 100, committed: 0 }), 0);
});

test("total papan sama dengan jumlah rincian per jenis biaya", () => {
  // Kalau total dan rincian bisa berbeda, papan ini kehilangan gunanya.
  const d = mockCostBoard("clx8n2k4p0001qw3f7yz9abcd");
  const sum = (k: "baseline" | "actual" | "committed" | "pending") =>
    d.categories.reduce((t, c) => t + c[k], 0);
  assert.equal(d.baseline, sum("baseline"));
  assert.equal(d.actual, sum("actual"));
  assert.equal(d.committed, sum("committed"));
  assert.equal(d.pending, sum("pending"));
});

test("menunggu persetujuan tidak pernah ikut terhitung sebagai aktual", () => {
  const d = mockCostBoard("clx8n2k4p0001qw3f7yz9abcd");
  assert.ok(d.pending > 0);
  assert.equal(
    forecastAtCompletion(d),
    Math.max(d.baseline, d.actual + d.committed),
  );
});

test("papan biaya menolak alamat yang bukan id proyek", async () => {
  assert.equal(await loadCostBoard("bukan-id"), null);
  assert.notEqual(await loadCostBoard("clx8n2k4p0001qw3f7yz9abcd"), null);
});

test("penanda selisih memakai ambang yang sama dengan sinyal risiko", () => {
  const d = (actual: number, committed = 0) => ({ baseline: 100, actual, committed });
  assert.equal(varianceStatus(d(50)), "SAFE");
  assert.equal(varianceStatus(d(89)), "SAFE");
  // 90% adalah ambang BUDGET_NEAR_LIMIT pada computeProjectRiskSignals().
  assert.equal(varianceStatus(d(BASELINE_NEAR_LIMIT_PERCENT)), "NEAR_LIMIT");
  assert.equal(varianceStatus(d(100)), "NEAR_LIMIT");
  assert.equal(varianceStatus(d(101)), "OVER");
});

test("komitmen ikut memicu penanda, bukan hanya biaya yang disetujui", () => {
  // Papan menyala lebih dulu daripada sinyal risiko, dan itu disengaja:
  // peringatan berguna selagi masih ada waktu.
  assert.equal(varianceStatus({ baseline: 100, actual: 60, committed: 35 }), "NEAR_LIMIT");
  assert.equal(varianceStatus({ baseline: 100, actual: 60, committed: 50 }), "OVER");
});

test("tanpa baseline, papan tidak berpura-pura tahu posisi belanja", () => {
  assert.equal(varianceStatus({ baseline: 0, actual: 500, committed: 0 }), "NO_BASELINE");
});
