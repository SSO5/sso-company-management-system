import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Penjaga bentuk skema.
 *
 * Migrasi dijalankan manual lewat GitHub Actions ke basis data produksi, jadi
 * tidak ada cara mengujinya di sini. Yang bisa dijaga adalah janji-janji yang
 * membuat migrasi itu aman — dan justru itulah yang mudah hilang saat
 * seseorang menyunting schema.prisma enam bulan lagi.
 */

const schema = readFileSync("prisma/schema.prisma", "utf8");
const workflow = readFileSync(
  ".github/workflows/db-schema-cost-type.yml",
  "utf8",
);

// Hanya blok SQL-nya, bukan komentar di atasnya — komentar boleh menyebut
// kata "DROP" untuk menjelaskan bahwa tidak ada DROP.
const sql = workflow.slice(
  workflow.indexOf("<<'SQL'"),
  workflow.indexOf("\n          SQL\n"),
);

const costTypeModel = schema.slice(
  schema.indexOf("model CostType {"),
  schema.indexOf("}", schema.indexOf("model CostType {")),
);

test("kode jenis biaya unik", () => {
  // Tanpa unik, "MAT-PANEL" bisa ada dua kali dan pemetaan pagu jadi ambigu.
  assert.match(costTypeModel, /code\s+String\s+@unique/);
});

test("ProjectExpense.costTypeId nullable", () => {
  // Ribuan biaya lama dicatat sebelum daftar jenis biaya ada. Kolom NOT NULL
  // akan menolak migrasinya, atau memaksa nilai karangan pada data nyata.
  assert.match(schema, /costTypeId\s+String\?/);
  assert.match(workflow, /ADD COLUMN\s+"costTypeId" TEXT;/);
  assert.doesNotMatch(workflow, /"costTypeId" TEXT NOT NULL/);
});

test("menghapus jenis biaya atau akun tidak ikut menghapus biaya proyek", () => {
  // ON DELETE CASCADE di sini berarti merapikan daftar master bisa
  // memusnahkan catatan pengeluaran. Keduanya harus SET NULL.
  const fks = workflow.match(/ADD CONSTRAINT "[^"]+_fkey"[^;]+;/g) ?? [];
  assert.equal(fks.length, 2);
  for (const fk of fks) {
    assert.match(fk, /ON DELETE SET NULL/, fk);
    assert.doesNotMatch(fk, /ON DELETE CASCADE/, fk);
  }
});

test("migrasi tidak menghapus apa pun", () => {
  // Aditif sepenuhnya: satu tabel baru dan satu kolom nullable.
  assert.ok(sql.length > 100, "blok SQL tidak ditemukan");
  assert.doesNotMatch(sql, /\bDROP\b/);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/);
  assert.doesNotMatch(sql, /\bDELETE FROM\b/);
});

test("CostType tetap bermuara ke ExpenseCategory", () => {
  // Inilah yang membuat laporan lama tetap benar tanpa disentuh: CostType
  // menambah kerincian, bukan menggantikan enum yang dipakai belasan tempat.
  assert.match(costTypeModel, /category\s+ExpenseCategory/);
  assert.match(workflow, /"category" "ExpenseCategory" NOT NULL/);
});

test("akun pembukuan boleh kosong di tingkat basis data juga", () => {
  // Kalau kolomnya NOT NULL, aturan "boleh dipetakan nanti" di form jadi
  // bohong dan penyimpanannya akan gagal.
  assert.match(costTypeModel, /chartOfAccountId\s+String\?/);
  assert.match(workflow, /"chartOfAccountId" TEXT,/);
});

test("workflow hanya berjalan kalau dijalankan orang", () => {
  // Perubahan skema produksi tidak boleh ikut terpicu oleh push.
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s{2}push:/);
});
