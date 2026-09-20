import test from "node:test";
import assert from "node:assert/strict";
import { costTypeSchema, parseCostType } from "../src/lib/validation/cost-type";

const dasar = {
  code: "MAT-PANEL",
  name: "Material panel",
  category: "MATERIALS",
};

test("kode dinaikkan ke huruf besar, bukan ditolak", () => {
  // "mat-panel" dan "MAT-PANEL" adalah hal yang sama; memaksa pengguna
  // mengetik ulang hanya untuk itu tidak ada gunanya.
  assert.equal(costTypeSchema.parse({ ...dasar, code: "mat-panel" }).code, "MAT-PANEL");
  assert.equal(costTypeSchema.parse({ ...dasar, code: "  mat-panel " }).code, "MAT-PANEL");
});

test("kode berspasi atau bersimbol ditolak", () => {
  // Bentuk bebas melahirkan "mat panel", "Mat_Panel", dan "MATPANEL" sebagai
  // tiga jenis berbeda untuk hal yang sama.
  for (const code of ["MAT PANEL", "MAT_PANEL", "MAT.PANEL", "-MAT", "MAT-"]) {
    assert.throws(() => costTypeSchema.parse({ ...dasar, code }), Error, code);
  }
});

test("kode terlalu pendek atau terlalu panjang ditolak", () => {
  assert.throws(() => costTypeSchema.parse({ ...dasar, code: "M" }));
  assert.throws(() =>
    costTypeSchema.parse({ ...dasar, code: "M".repeat(25) }),
  );
});

test("nama terlalu pendek ditolak", () => {
  assert.throws(() => costTypeSchema.parse({ ...dasar, name: "ab" }));
});

test("kelompok di luar ExpenseCategory ditolak", () => {
  assert.throws(() => costTypeSchema.parse({ ...dasar, category: "SEWA" }));
});

test("akun pembukuan boleh kosong", () => {
  // Memaksanya diisi hanya membuat orang memilih akun asal-asalan supaya
  // formnya mau tersimpan.
  assert.equal(costTypeSchema.parse(dasar).chartOfAccountId, null);
  assert.equal(
    costTypeSchema.parse({ ...dasar, chartOfAccountId: "" }).chartOfAccountId,
    null,
  );
  assert.equal(
    costTypeSchema.parse({ ...dasar, chartOfAccountId: "coa-1" }).chartOfAccountId,
    "coa-1",
  );
});

test("keterangan kosong disimpan sebagai null, bukan string kosong", () => {
  // Supaya tidak ada dua bentuk "kosong" di basis data.
  assert.equal(costTypeSchema.parse({ ...dasar, description: "" }).description, null);
  assert.equal(costTypeSchema.parse({ ...dasar, description: "   " }).description, null);
  assert.equal(
    costTypeSchema.parse({ ...dasar, description: " dipakai untuk panel " }).description,
    "dipakai untuk panel",
  );
});

test("jenis baru aktif secara bawaan", () => {
  assert.equal(costTypeSchema.parse(dasar).isActive, true);
  assert.equal(costTypeSchema.parse({ ...dasar, isActive: false }).isActive, false);
});

test("galat validasi jadi satu kalimat, bukan larik JSON", () => {
  // Pesan ZodError mentah panjangnya melewati 300 karakter, dan runAction()
  // menukar pesan sepanjang itu dengan "Something went wrong" — sehingga
  // aturan validasi yang sudah ditulis tidak pernah terbaca pengguna.
  try {
    parseCostType({ code: "M", name: "ab", category: "SEWA" });
    assert.fail("seharusnya ditolak");
  } catch (e) {
    const pesan = (e as Error).message;
    assert.ok(pesan.length < 300, `terlalu panjang: ${pesan.length}`);
    assert.doesNotMatch(pesan, /[[{]/, "masih berbentuk JSON");
    assert.match(pesan, /Kode minimal 2 karakter/);
    assert.match(pesan, /Nama jenis biaya minimal 3 karakter/);
  }
});

test("isian yang benar melewati parseCostType apa adanya", () => {
  const hasil = parseCostType({
    code: "mat-panel",
    name: "Material panel",
    category: "MATERIALS",
  });
  assert.equal(hasil.code, "MAT-PANEL");
  assert.equal(hasil.chartOfAccountId, null);
});
