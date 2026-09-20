import test from "node:test";
import assert from "node:assert/strict";
import {
  consumedPercent,
  forecastAtCompletion,
  loadCostBoard,
  mockCostBoard,
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
