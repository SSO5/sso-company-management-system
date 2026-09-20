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
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "ProjectBudgetBaseline_one_current_per_project"/,
  );
  assert.match(sql, /ON "ProjectBudgetBaseline"\("projectId"\)\s*\n?\s*WHERE "isCurrent"/);
});

test("nomor versi unik per proyek", () => {
  assert.match(model("ProjectBudgetBaseline"), /@@unique\(\[projectId, version\]\)/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "ProjectBudgetBaseline_projectId_version_key"/,
  );
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

test("gagal di tengah tidak meninggalkan basis data setengah jadi", () => {
  // Tanpa --single-transaction, psql berjalan autocommit: pada percobaan
  // dengan urutan terbalik, kedua tabel sempat terbuat dan tiga foreign key
  // terpasang sebelum perintah yang gagal. Itu keadaan yang paling sulit
  // dibereskan, karena menjalankan ulang lalu gagal "already exists".
  assert.match(workflow, /psql "\$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction/);
});

test("urutan migrasi diperiksa sendiri, bukan diserahkan ke ingatan", () => {
  // Migrasi ini menunjuk ke CostType. Galat "relation does not exist" tidak
  // memberi tahu siapa pun apa yang harus dijalankan lebih dulu.
  assert.match(sql, /RAISE EXCEPTION 'Tabel CostType belum ada\./);
  assert.match(sql, /information_schema\.tables WHERE table_name = 'CostType'/);
});

test("seluruh perintah aman dijalankan ulang", () => {
  // Setelah sebuah workflow gagal, hal pertama yang dilakukan orang adalah
  // menjalankannya lagi. Itu tidak boleh merusak apa pun.
  const creates = sql.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX) (?!IF NOT EXISTS)/g);
  assert.equal(creates, null, `ada CREATE tanpa IF NOT EXISTS: ${creates}`);
  // Postgres belum punya ADD CONSTRAINT IF NOT EXISTS, jadi tiap foreign key
  // wajib dijaga pemeriksaan pg_constraint.
  const fkCount = (sql.match(/ADD CONSTRAINT "[^"]+_fkey"/g) ?? []).length;
  const guardCount = (sql.match(/pg_constraint WHERE conname = '[^']+_fkey'/g) ?? []).length;
  assert.equal(fkCount, 6);
  assert.equal(guardCount, fkCount);
});
