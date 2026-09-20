import test from "node:test";
import assert from "node:assert/strict";
import {
  budgetDrift,
  canBecomeBaseline,
  isLocked,
  loadProjectBaseline,
  mockProjectBaseline,
  reasonRequired,
  SET_BASELINE_MESSAGE,
  sumBaselineLines,
  unmappedBaselineLines,
  validateSetBaseline,
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

/* --- penetapan baseline --- */

const berlaku = () => mockProjectBaseline(id).current!;

test("baseline pertama tidak menuntut alasan, penggantian menuntut", () => {
  // Versi pertama tidak menggantikan apa pun. Mulai versi kedua, baseline
  // yang berganti tanpa keterangan menghapus satu-satunya penjelasan kenapa
  // angka pembandingnya bergeser.
  assert.equal(reasonRequired(null), false);
  assert.equal(reasonRequired(berlaku()), true);

  assert.deepEqual(
    validateSetBaseline({
      costing: { number: "007/CST/MKT/IX/2026", revision: 0, status: "FINAL" },
      reason: "",
      current: null,
    }),
    [],
  );
  assert.deepEqual(
    validateSetBaseline({
      costing: { number: "007/CST/MKT/IX/2026", revision: 0, status: "FINAL" },
      reason: "   ",
      current: berlaku(),
    }),
    ["ALASAN_KOSONG"],
  );
});

test("costing draf ditolak sebagai sumber baseline", () => {
  assert.deepEqual(
    validateSetBaseline({
      costing: { number: "009/CST/MKT/IX/2026", revision: 0, status: "DRAFT" },
      reason: "alasan",
      current: berlaku(),
    }),
    ["COSTING_MASIH_DRAF"],
  );
});

test("menetapkan ulang costing yang sama ditolak", () => {
  // Hanya menambah versi tanpa mengubah angka; riwayat jadi penuh baris yang
  // tidak berarti.
  const c = berlaku();
  assert.deepEqual(
    validateSetBaseline({
      costing: { number: c.costingNumber, revision: c.costingRevision, status: "FINAL" },
      reason: "alasan",
      current: c,
    }),
    ["SAMA_DENGAN_BERLAKU"],
  );
});

test("revisi berbeda dari costing yang sama tetap boleh", () => {
  const c = berlaku();
  assert.deepEqual(
    validateSetBaseline({
      costing: {
        number: c.costingNumber,
        revision: c.costingRevision + 1,
        status: "FINAL",
      },
      reason: "revisi lingkup",
      current: c,
    }),
    [],
  );
});

test("semua masalah dilaporkan sekaligus, bukan satu per satu", () => {
  // Form yang menyebut satu kesalahan lalu menyebut kesalahan berikutnya
  // setelah dikirim ulang membuat orang menebak-nebak.
  const problems = validateSetBaseline({
    costing: { number: "009/CST/MKT/IX/2026", revision: 0, status: "DRAFT" },
    reason: "",
    current: berlaku(),
  });
  assert.deepEqual(problems.sort(), ["ALASAN_KOSONG", "COSTING_MASIH_DRAF"]);
});

test("tiap masalah punya kalimat penjelasnya sendiri", () => {
  for (const key of [
    "COSTING_TIDAK_DIPILIH",
    "COSTING_MASIH_DRAF",
    "ALASAN_KOSONG",
    "SAMA_DENGAN_BERLAKU",
  ] as const) {
    assert.ok(SET_BASELINE_MESSAGE[key].length > 10, key);
  }
});

test("costing yang sudah dihapus tidak membatalkan baseline", () => {
  // Baseline adalah salinan beku, bukan tautan hidup. Yang hilang hanya
  // jalan pintas ke dokumennya.
  const lama = mockProjectBaseline(id).history.find((v) => v.costingId === null)!;
  assert.equal(lama.costingId, null);
  assert.ok(lama.amount > 0);
  assert.equal(lama.costingNumber.length > 0, true);
  assert.equal(sumBaselineLines(lama.lines), lama.amount);
});

test("versi yang berlaku bisa ditelusuri ke dokumen costingnya", () => {
  const c = mockProjectBaseline(id).current!;
  assert.notEqual(c.costingId, null);
  assert.notEqual(c.setBy, "");
  assert.notEqual(c.setAt, "");
});
