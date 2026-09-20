import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Penjaga bentuk skema baseline.
 *
 * Migrasi dijalankan manual ke produksi dan tidak bisa diuji di sini. Yang
 * bisa dijaga adalah janji-janji yang membuat baseline layak dipercaya —
 * dan justru itu yang paling mudah hilang saat seseorang menyunting
 * schema.prisma nanti.
 */

const schema = readFileSync("prisma/schema.prisma", "utf8");
const workflow = readFileSync(
  ".github/workflows/db-schema-budget-baseline.yml",
  "utf8",
);
const sql = workflow.slice(
  workflow.indexOf("<<'SQL'"),
  workflow.lastIndexOf("\n          SQL\n"),
);

const model = (name: string) => {
  const start = schema.indexOf(`model ${name} {`);
  assert.notEqual(start, -1, `model ${name} tidak ditemukan`);
  return schema.slice(start, schema.indexOf("\n}", start));
};

test("hanya satu baseline yang boleh berlaku per proyek", () => {
  // Prisma tidak bisa menyatakan indeks unik parsial, jadi ia ditulis manual.
  // Tanpa itu, satu galat di server bisa meninggalkan dua baseline berlaku
  // sekaligus dan papan biaya akan memilih salah satunya tanpa ada yang tahu.
  assert.match(sql, /CREATE UNIQUE INDEX "ProjectBudgetBaseline_one_current_per_project"/);
  assert.match(sql, /ON "ProjectBudgetBaseline"\("projectId"\)\s*\n?\s*WHERE "isCurrent"/);
});

test("nomor versi unik per proyek", () => {
  assert.match(model("ProjectBudgetBaseline"), /@@unique\(\[projectId, version\]\)/);
  assert.match(sql, /CREATE UNIQUE INDEX "ProjectBudgetBaseline_projectId_version_key"/);
});

test("nomor costing DISALIN, bukan sekadar ditautkan", () => {
  // Costing yang kelak dihapus tidak boleh membatalkan baseline: ia salinan
  // beku, bukan tautan hidup.
  const m = model("ProjectBudgetBaseline");
  assert.match(m, /costingNumber\s+String\b/);
  assert.match(m, /costingRevision\s+Int/);
  assert.match(m, /costingSheetId\s+String\?/);
  assert.match(
    sql,
    /"ProjectBudgetBaseline_costingSheetId_fkey".*ON DELETE SET NULL/s,
  );
});

test("baris baseline boleh belum punya jenis biaya", () => {
  // Costing bisa memuat baris yang belum dipetakan, dan barisnya tetap harus
  // tersimpan — papan biaya menampilkannya "belum dipetakan", bukan nol.
  assert.match(model("ProjectBudgetBaselineLine"), /costTypeId\s+String\?/);
  assert.match(sql, /"costTypeId" TEXT,/);
});

test("menghapus jenis biaya tidak ikut menghapus baris baseline", () => {
  assert.match(
    sql,
    /"ProjectBudgetBaselineLine_costTypeId_fkey".*ON DELETE SET NULL/s,
  );
});

test("baris ikut terhapus hanya bersama baselinenya sendiri", () => {
  // Cascade di sini benar: baris tanpa induk tidak berarti apa-apa. Cascade
  // dari CostType atau CostingSheet justru berbahaya, dan itu diuji di atas.
  assert.match(
    sql,
    /"ProjectBudgetBaselineLine_baselineId_fkey".*ON DELETE CASCADE/s,
  );
});

test("migrasi tidak menghapus atau mengubah tabel lama", () => {
  assert.ok(sql.length > 500, "blok SQL tidak ditemukan");
  assert.doesNotMatch(sql, /\bDROP\b/);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/);
  assert.doesNotMatch(sql, /\bDELETE FROM\b/);
  assert.doesNotMatch(sql, /\bALTER TABLE "Project"\b/);
});

test("workflow hanya berjalan kalau dijalankan orang", () => {
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s{2}push:/);
});
