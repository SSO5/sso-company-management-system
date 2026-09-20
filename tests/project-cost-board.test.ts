import test from "node:test";
import assert from "node:assert/strict";
import {
  BASELINE_NEAR_LIMIT_PERCENT,
  consumedPercent,
  forecastAtCompletion,
  loadCostBoard,
  mockCostBoard,
  PENDING_STALE_DAYS,
  splitPendingByHolder,
  stalePendingRows,
  sumPending,
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

test("antrean dipisah menurut siapa yang memegang bolanya", () => {
  const d = mockCostBoard("clx8n2k4p0001qw3f7yz9abcd");
  const { diPengaju, diFinance } = splitPendingByHolder(d.pendingRows);
  assert.ok(diFinance.every((r) => r.approvalStatus === "SUBMITTED"));
  assert.ok(diPengaju.every((r) => r.approvalStatus === "DRAFT"));
  // Tidak boleh ada baris yang hilang atau terhitung dua kali.
  assert.equal(diPengaju.length + diFinance.length, d.pendingRows.length);
});

test("total menunggu sama dengan jumlah baris antreannya", () => {
  const d = mockCostBoard("clx8n2k4p0001qw3f7yz9abcd");
  assert.equal(sumPending(d.pendingRows), d.pending);
});

test("baris yang mengendap diurutkan dari yang paling tua", () => {
  const d = mockCostBoard("clx8n2k4p0001qw3f7yz9abcd");
  const stale = stalePendingRows(d.pendingRows);
  assert.ok(stale.every((r) => r.ageDays >= PENDING_STALE_DAYS));
  assert.deepEqual(
    stale.map((r) => r.ageDays),
    [...stale.map((r) => r.ageDays)].sort((a, b) => b - a),
  );
});

test("antrean kosong tidak menghasilkan peringatan apa pun", () => {
  assert.equal(sumPending([]), 0);
  assert.deepEqual(stalePendingRows([]), []);
});

test("papan tanpa antrean melaporkan nol, bukan angka yang hilang", () => {
  // Bagian "menunggu" tetap ditampilkan saat kosong, jadi angkanya harus
  // benar-benar nol dan bukan sekadar tidak dihitung.
  assert.equal(sumPending([]), 0);
  assert.equal(splitPendingByHolder([]).diFinance.length, 0);
  assert.equal(splitPendingByHolder([]).diPengaju.length, 0);
});

test("total tabel rincian selalu cocok dengan kartu perbandingan", () => {
  // Tabel dan kartu membaca sumber yang sama; kalau totalnya bisa berbeda,
  // salah satunya salah dan papan ini kehilangan gunanya.
  const d = mockCostBoard("clx8n2k4p0001qw3f7yz9abcd");
  const total = d.categories.reduce(
    (t, r) => ({
      baseline: t.baseline + r.baseline,
      actual: t.actual + r.actual,
      committed: t.committed + r.committed,
    }),
    { baseline: 0, actual: 0, committed: 0 },
  );
  assert.equal(varianceToBaseline(total), varianceToBaseline(d));
  assert.equal(forecastAtCompletion(total), forecastAtCompletion(d));
});
