import test from "node:test";
import assert from "node:assert/strict";
import {
  baselineHistoryRows,
  baselineNotComparable,
  budgetDrift,
  canBecomeBaseline,
  canUnlockBaseline,
  isLocked,
  loadProjectBaseline,
  mockProjectBaseline,
  pairBaselineWithActual,
  spendOutsideBaseline,
  reasonRequired,
  SET_BASELINE_MESSAGE,
  sumBaselineLines,
  totalBaselineChange,
  unmappedBaselineLines,
  UNLOCK_REASON_MIN_LENGTH,
  validateSetBaseline,
  validateUnlockBaseline,
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

/* --- kunci dan buka kunci --- */

test("hanya Admin yang boleh membuka kunci baseline", () => {
  // Membuka kunci mengizinkan angka pembanding berubah TANPA versi baru,
  // jadi laporan bulan lalu bisa berubah arti tanpa jejak.
  assert.equal(canUnlockBaseline("ADMIN"), true);
  for (const role of ["FINANCE", "PROJECT_MANAGER", "SALES", "IT", "VIEWER"]) {
    assert.equal(canUnlockBaseline(role), false, role);
  }
});

test("pesan penolakan menyebut jalan keluarnya, bukan cuma menolak", () => {
  const pesan = validateUnlockBaseline({ role: "FINANCE", reason: "alasan panjang" });
  assert.ok(pesan);
  assert.match(pesan!, /versi baru/);
});

test("membuka kunci menuntut alasan yang berarti, bukan satu huruf", () => {
  assert.ok(validateUnlockBaseline({ role: "ADMIN", reason: "" }));
  assert.ok(validateUnlockBaseline({ role: "ADMIN", reason: "salah" }));
  assert.ok(
    validateUnlockBaseline({
      role: "ADMIN",
      reason: " ".repeat(UNLOCK_REASON_MIN_LENGTH + 5),
    }),
    "spasi saja tidak boleh lolos",
  );
  assert.equal(
    validateUnlockBaseline({
      role: "ADMIN",
      reason: "Salah input angka material, dikoreksi bersama akuntan.",
    }),
    null,
  );
});

/* --- riwayat versi --- */

test("perubahan dihitung terhadap versi lebih lama, bukan baris di atasnya", () => {
  // Tabelnya diurutkan dari yang terbaru, tapi selisihnya tetap harus
  // bermakna: v2 dibandingkan dengan v1, bukan sebaliknya.
  const d = mockProjectBaseline(id);
  const rows = baselineHistoryRows(d.history, d.current!.id);
  assert.deepEqual(
    rows.map((r) => r.version.version),
    [2, 1],
  );
  const v1 = d.history.find((v) => v.version === 1)!;
  const v2 = d.history.find((v) => v.version === 2)!;
  assert.equal(rows[0].delta, v2.amount - v1.amount);
  // Versi pertama tidak punya pembanding.
  assert.equal(rows[1].delta, null);
});

test("versi yang berlaku ditandai, sisanya tidak", () => {
  const d = mockProjectBaseline(id);
  const rows = baselineHistoryRows(d.history, d.current!.id);
  assert.equal(rows.filter((r) => r.isCurrent).length, 1);
  assert.equal(rows[0].isCurrent, true);
});

test("riwayat satu versi tidak melaporkan perubahan total", () => {
  const d = mockProjectBaseline(id);
  const satu = [d.current!];
  assert.equal(totalBaselineChange(satu), null);
  assert.equal(totalBaselineChange([]), null);
});

test("perubahan total dihitung dari baseline pertama ke yang berlaku", () => {
  const d = mockProjectBaseline(id);
  const v1 = d.history.find((v) => v.version === 1)!;
  const v2 = d.history.find((v) => v.version === 2)!;
  assert.equal(totalBaselineChange(d.history), v2.amount - v1.amount);
  // Urutan masukan tidak boleh mengubah hasilnya.
  assert.equal(
    totalBaselineChange([...d.history].reverse()),
    v2.amount - v1.amount,
  );
});

test("menyusun riwayat tidak mengubah daftar aslinya", () => {
  const d = mockProjectBaseline(id);
  const salinan = d.history.map((v) => v.id);
  baselineHistoryRows(d.history, d.current!.id);
  totalBaselineChange(d.history);
  assert.deepEqual(d.history.map((v) => v.id), salinan);
});

/* --- baseline diadu dengan realisasi --- */

const garis = (
  costTypeCode: string | null,
  amount: number,
  label = costTypeCode ?? "tanpa jenis",
) => ({ costTypeCode, label, category: "OTHER" as const, amount });

test("pagu dan realisasi dipasangkan lewat kode jenis biaya", () => {
  const rows = pairBaselineWithActual(
    [garis("MAT", 100), garis("UPAH", 50)],
    [{ costTypeCode: "MAT", actual: 60, committed: 10 }],
  );
  const mat = rows.find((r) => r.costTypeCode === "MAT")!;
  assert.equal(mat.baseline, 100);
  assert.equal(mat.actual, 60);
  assert.equal(mat.committed, 10);
  assert.equal(mat.remaining, 30);

  // Jenis yang dianggarkan tapi belum dibelanjakan tetap muncul, bernilai nol.
  const upah = rows.find((r) => r.costTypeCode === "UPAH")!;
  assert.equal(upah.actual, 0);
  assert.equal(upah.remaining, 50);
});

test("baris baseline tanpa jenis biaya tidak terlihat hemat 100%", () => {
  // Kalau diperlakukan sebagai nol terpakai, ia akan terbaca paling hemat
  // justru karena tidak bisa diukur.
  const rows = pairBaselineWithActual([garis(null, 35)], []);
  assert.equal(rows[0].gap, "BELUM_DIPETAKAN");
  assert.equal(rows[0].remaining, null);
  assert.equal(baselineNotComparable(rows), 35);
});

test("belanja di luar baseline dimunculkan, bukan dibuang diam-diam", () => {
  // Inilah bentuk pembengkakan yang paling mudah luput: uang keluar pada
  // jenis biaya yang memang tidak pernah dianggarkan.
  const rows = pairBaselineWithActual(
    [garis("MAT", 100)],
    [
      { costTypeCode: "MAT", actual: 50, committed: 0 },
      { costTypeCode: "DENDA", actual: 7_000_000, committed: 1_000_000 },
    ],
  );
  const luar = rows.find((r) => r.costTypeCode === "DENDA")!;
  assert.equal(luar.gap, "DI_LUAR_BASELINE");
  assert.equal(luar.baseline, null);
  assert.equal(luar.remaining, null);
  assert.equal(spendOutsideBaseline(rows), 8_000_000);
});

test("sisa negatif berarti jenis biaya itu sudah lewat pagunya", () => {
  const rows = pairBaselineWithActual(
    [garis("MAT", 100)],
    [{ costTypeCode: "MAT", actual: 90, committed: 30 }],
  );
  assert.equal(rows[0].remaining, -20);
});

test("data tiruan memperlihatkan ketiga keadaan sekaligus", () => {
  const d = mockProjectBaseline(id);
  const rows = pairBaselineWithActual(d.current!.lines, d.realisation);
  assert.ok(rows.some((r) => r.gap === null));
  assert.ok(rows.some((r) => r.gap === "BELUM_DIPETAKAN"));
  // Tidak ada belanja di luar baseline pada data tiruan; nilainya harus nol,
  // bukan NaN.
  assert.equal(spendOutsideBaseline(rows), 0);
});

test("pemeriksaan penetapan hanya butuh nomor dan revisi baseline berlaku", () => {
  // Pemanggil di server membaca baris basis data; memaksanya menyusun objek
  // tampilan lengkap hanya untuk lewat pemeriksaan akan melahirkan kolom
  // karangan yang tidak dipakai siapa pun.
  const problems = validateSetBaseline({
    costing: { number: "007/CST/MKT/IX/2026", revision: 0, status: "FINAL" },
    reason: "ganti lingkup",
    current: { costingNumber: "003/CST/MKT/VIII/2026", costingRevision: 1 },
  });
  assert.deepEqual(problems, []);
});

test("alasan tetap wajib walau baseline berlaku hanya dikenal sebagian", () => {
  assert.equal(
    reasonRequired({ costingNumber: "X", costingRevision: 0 }),
    true,
  );
  assert.equal(reasonRequired(null), false);
  assert.equal(reasonRequired(undefined), false);
});

test("realisasi hanya menghitung yang disetujui, komitmen berdiri sendiri", () => {
  // Aturan yang sama dengan papan biaya. Kalau halaman baseline
  // menghitungnya dengan cara lain, dua layar akan menampilkan realisasi
  // berbeda untuk proyek yang sama.
  const d = mockProjectBaseline(id);
  const rows = pairBaselineWithActual(d.current!.lines, d.realisation);
  for (const r of rows) {
    assert.ok(r.actual >= 0, r.label);
    assert.ok(r.committed >= 0, r.label);
  }
  // Komitmen tidak pernah ikut terhitung sebagai terpakai.
  const total = d.realisation.reduce((t, r) => t + r.actual, 0);
  assert.equal(
    rows.reduce((t, r) => t + r.actual, 0),
    total,
  );
});
