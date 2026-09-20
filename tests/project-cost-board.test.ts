import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCostByCategory,
  BASELINE_NEAR_LIMIT_PERCENT,
  categoryShares,
  consumedPercent,
  forecastAtCompletion,
  loadCostBoard,
  mockCostBoard,
  PENDING_STALE_DAYS,
  splitPendingByHolder,
  stalePendingRows,
  summarizeCostBoard,
  sumPending,
  topCategoriesCovering,
  varianceStatus,
  varianceToBaseline,
  withBaselineNumber,
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
    d.categories.reduce((t, c) => t + (c[k] ?? 0), 0);
  assert.equal(d.summary.baseline, sum("baseline"));
  assert.equal(d.summary.actual, sum("actual"));
  assert.equal(d.summary.committed, sum("committed"));
  assert.equal(d.summary.pending, sum("pending"));
});

test("menunggu persetujuan tidak pernah ikut terhitung sebagai aktual", () => {
  const d = mockCostBoard("clx8n2k4p0001qw3f7yz9abcd");
  assert.ok(d.summary.pending > 0);
  assert.equal(
    d.summary.forecast,
    Math.max(d.summary.baseline, d.summary.actual + d.summary.committed),
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
  assert.equal(sumPending(d.pendingRows), d.summary.pending);
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
      baseline: t.baseline + (r.baseline ?? 0),
      actual: t.actual + r.actual,
      committed: t.committed + r.committed,
    }),
    { baseline: 0, actual: 0, committed: 0 },
  );
  assert.equal(varianceToBaseline(total), d.summary.variance);
  assert.equal(forecastAtCompletion(total), d.summary.forecast);
});

test("peringkat jenis biaya memakai belanja nyata, bukan baseline", () => {
  // Baseline hanyalah rencana. "Ke mana uangnya pergi" hanya bisa dijawab
  // oleh yang sudah terpakai dan yang sudah terikat.
  const rows = [
    { category: "LABOR" as const, baseline: 900, actual: 100, committed: 0, pending: 0 },
    { category: "MATERIALS" as const, baseline: 100, actual: 200, committed: 100, pending: 0 },
  ];
  const shares = categoryShares(rows);
  assert.equal(shares[0].row.category, "MATERIALS");
  assert.equal(shares[0].rank, 1);
  assert.equal(shares[0].spend, 300);
  assert.equal(shares[0].sharePercent, 75);
  assert.equal(shares[1].sharePercent, 25);
});

test("nilai menunggu persetujuan tidak ikut memeringkat", () => {
  const rows = [
    { category: "LABOR" as const, baseline: 100, actual: 10, committed: 0, pending: 5_000 },
    { category: "MATERIALS" as const, baseline: 100, actual: 50, committed: 0, pending: 0 },
  ];
  assert.equal(categoryShares(rows)[0].row.category, "MATERIALS");
});

test("porsi tidak pecah saat belum ada belanja sama sekali", () => {
  const rows = [
    { category: "LABOR" as const, baseline: 100, actual: 0, committed: 0, pending: 0 },
  ];
  const shares = categoryShares(rows);
  assert.equal(shares[0].sharePercent, 0);
  assert.deepEqual(topCategoriesCovering(shares), []);
});

test("topCategoriesCovering berhenti begitu ambang tercapai", () => {
  const d = mockCostBoard("clx8n2k4p0001qw3f7yz9abcd");
  const shares = categoryShares(d.categories);
  const top = topCategoriesCovering(shares, 80);
  const acc = top.reduce((t, s) => t + s.sharePercent, 0);
  assert.ok(acc >= 80);
  // Tidak mengambil lebih banyak daripada yang dibutuhkan.
  const tanpaTerakhir = acc - top[top.length - 1].sharePercent;
  assert.ok(tanpaTerakhir < 80);
});

/* --- agregasi dari baris nyata --- */

test("hanya biaya APPROVED yang menjadi aktual per jenis biaya", () => {
  const rows = aggregateCostByCategory({
    expenses: [
      { category: "LABOR", total: 1_000, approvalStatus: "APPROVED", paymentStatus: "PAID" },
      { category: "LABOR", total: 500, approvalStatus: "SUBMITTED", paymentStatus: "UNPAID" },
      { category: "LABOR", total: 9_000, approvalStatus: "REJECTED", paymentStatus: "UNPAID" },
    ],
    vendorPos: [],
  });
  const labor = rows.find((r) => r.category === "LABOR")!;
  assert.equal(labor.actual, 1_000);
  assert.equal(labor.pending, 500);
  // Yang ditolak tidak boleh muncul di mana pun.
  assert.equal(labor.actual + labor.pending + labor.committed, 1_500);
});

test("PO vendor yang biayanya sudah disetujui tidak dihitung dua kali", () => {
  const rows = aggregateCostByCategory({
    expenses: [
      { category: "VENDOR", total: 25_000, approvalStatus: "APPROVED", paymentStatus: "UNPAID" },
    ],
    vendorPos: [
      { category: "VENDOR", grandTotal: 25_000, expenseApprovalStatus: "APPROVED" },
      { category: "VENDOR", grandTotal: 40_000, expenseApprovalStatus: null },
    ],
  });
  const vendor = rows.find((r) => r.category === "VENDOR")!;
  assert.equal(vendor.actual, 25_000);
  assert.equal(vendor.committed, 40_000);
});

test("PO vendor tanpa jenis biaya jatuh ke Lainnya, tidak hilang", () => {
  // Uang yang terikat harus tetap kelihatan walau pengelompokannya belum rapi.
  const rows = aggregateCostByCategory({
    expenses: [],
    vendorPos: [{ category: null, grandTotal: 7_000, expenseApprovalStatus: null }],
  });
  assert.equal(rows.find((r) => r.category === "OTHER")!.committed, 7_000);
});

test("jenis biaya tanpa satu baris pun tidak ditampilkan", () => {
  // Delapan baris nol hanya menyembunyikan yang benar-benar terpakai.
  const rows = aggregateCostByCategory({
    expenses: [
      { category: "LABOR", total: 1, approvalStatus: "APPROVED", paymentStatus: "PAID" },
    ],
    vendorPos: [],
  });
  assert.equal(rows.length, 1);
});

test("baseline yang belum bisa dipetakan bernilai null, bukan nol", () => {
  // Nol akan membuat jenis biaya itu terbaca "lewat baseline" sejak rupiah
  // pertama, padahal pagunya memang belum diketahui.
  const rows = aggregateCostByCategory({
    expenses: [
      { category: "LABOR", total: 1_000, approvalStatus: "APPROVED", paymentStatus: "PAID" },
    ],
    vendorPos: [],
  });
  assert.equal(rows[0].baseline, null);
  assert.equal(varianceStatus(withBaselineNumber(rows[0])), "NO_BASELINE");
});

test("jenis biaya yang dianggarkan tapi belum terpakai tetap muncul", () => {
  const rows = aggregateCostByCategory({
    expenses: [],
    vendorPos: [],
    baselinePerCategory: { EQUIPMENT: 60_000_000 },
  });
  const eq = rows.find((r) => r.category === "EQUIPMENT")!;
  assert.equal(eq.baseline, 60_000_000);
  assert.equal(eq.actual, 0);
  assert.equal(varianceStatus(withBaselineNumber(eq)), "SAFE");
});

test("ringkasan menurunkan perkiraan dan selisihnya sendiri", () => {
  // Tidak ada pemanggil yang boleh menghitung ulang perkiraan atau selisih
  // dengan caranya sendiri; itulah gunanya summarizeCostBoard().
  const s = summarizeCostBoard({
    baseline: 100,
    actual: 60,
    committed: 50,
    pending: 7,
    payable: 20,
    baselineSource: "CST-1",
    updatedAt: "2026-09-20T00:00:00.000Z",
  });
  assert.equal(s.forecast, 110);
  assert.equal(s.variance, -10);
  assert.equal(s.consumedPercent, 110);
  assert.equal(s.status, "OVER");
  // Angka menunggu ikut dibawa, tapi tidak pernah masuk ke perhitungan.
  assert.equal(s.pending, 7);
  assert.equal(s.forecast, Math.max(100, 60 + 50));
});

test("ringkasan tanpa baseline tidak berpura-pura tahu posisinya", () => {
  const s = summarizeCostBoard({
    baseline: 0,
    actual: 5_000_000,
    committed: 0,
    pending: 0,
    payable: 0,
    baselineSource: null,
    updatedAt: "2026-09-20T00:00:00.000Z",
  });
  assert.equal(s.status, "NO_BASELINE");
  assert.equal(s.consumedPercent, 0);
});

test("ringkasan papan identik dengan ringkasan yang berdiri sendiri", () => {
  const d = mockCostBoard("clx8n2k4p0001qw3f7yz9abcd");
  const ulang = summarizeCostBoard({
    baseline: d.summary.baseline,
    actual: d.summary.actual,
    committed: d.summary.committed,
    pending: d.summary.pending,
    payable: d.summary.payable,
    baselineSource: d.summary.baselineSource,
    updatedAt: d.summary.updatedAt,
  });
  assert.deepEqual(d.summary, ulang);
});
