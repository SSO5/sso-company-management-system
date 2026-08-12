/**
 * One run, full picture: why did the import find nothing?
 *
 * The import has three independent places it can come up empty, and its own
 * output does not separate them cleanly:
 *   1. the folder path is wrong, or OneDrive has not hydrated it
 *   2. the folders are read, but none matches a Project/Opportunity by name
 *   3. everything matched, but the target folder tree has no routeKeys
 * Guessing between these costs a round trip each time. This prints all three
 * at once, plus what is actually in the database now.
 *
 * Read-only. Writes nothing, changes nothing.
 *
 * Usage: npx tsx prisma/diagnose-import.ts [--root="<path>"]
 */
import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const [, ...rest] = hit.split("=");
  return rest.length ? rest.join("=") : "";
}

async function isDir(p: string): Promise<boolean> {
  try { return (await fs.stat(p)).isDirectory(); } catch { return false; }
}

// Kept identical to import-documents.ts on purpose: a diagnostic that scores
// differently from the thing it diagnoses is worse than none.
function words(s: string): string[] {
  return s.toLowerCase().replace(/^\d+[.\s]*/, "").replace(/\bpt\.?\b/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 0);
}
function acronym(s: string): string {
  return words(s).map((w) => w[0]).join("");
}
function matchScore(folderName: string, customerName: string): number {
  const a = new Set(words(folderName));
  const b = new Set(words(customerName));
  if (a.size === 0 || b.size === 0) return 0;
  if (a.size === 1) {
    const only = [...a][0];
    if (only === acronym(customerName) && only.length >= 2) return 1;
  }
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  if (shared === 0) return 0;
  return shared / new Set([...a, ...b]).size;
}

async function countFiles(dir: string): Promise<number> {
  let n = 0;
  for (const name of await fs.readdir(dir)) {
    if (name.startsWith(".") || /_STRUKTUR LAMA/i.test(name)) continue;
    const full = path.join(dir, name);
    n += (await isDir(full)) ? await countFiles(full) : 1;
  }
  return n;
}

async function main() {
  const root =
    flag("root") ||
    process.env.PROSPEK_PATH ||
    path.join(process.env.USERPROFILE || process.env.HOME || "", "OneDrive - PT. Petrindo Semesta", "PT SSO", "PROSPEK 2026");

  console.log("=".repeat(70));
  console.log("  1. FOLDER SUMBER");
  console.log("=".repeat(70));
  console.log(`  path : ${root}`);
  console.log(`  STORAGE_DRIVER : ${process.env.STORAGE_DRIVER || "(tidak diset -> local)"}`);
  console.log(`  S3_BUCKET set  : ${Boolean(process.env.S3_BUCKET)}`);

  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
    console.log(`  terbaca : ${entries.length} entri\n`);
  } catch (e) {
    console.log(`  GAGAL DIBACA : ${(e as Error).message}\n`);
    console.log("  -> Path salah, atau folder belum tersedia offline.");
    return;
  }

  const folders: { name: string; files: number }[] = [];
  for (const name of entries) {
    const full = path.join(root, name);
    const dir = await isDir(full);
    if (!dir) { console.log(`    [file]   ${name}`); continue; }
    let files = -1;
    try { files = await countFiles(full); } catch { /* unreadable */ }
    console.log(`    [folder] ${name}  (${files < 0 ? "tidak terbaca" : `${files} file`})`);
    folders.push({ name, files });
  }

  console.log("\n" + "=".repeat(70));
  console.log("  2. PEKERJAAN DI DATABASE");
  console.log("=".repeat(70));
  const [projects, opportunities] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, number: true, customer: { select: { companyName: true } }, folders: { select: { routeKey: true } } },
    }),
    prisma.opportunity.findMany({
      where: { deletedAt: null },
      select: { id: true, number: true, status: true, customer: { select: { companyName: true } }, folders: { select: { routeKey: true } } },
    }),
  ]);
  for (const p of projects)
    console.log(`    PROJECT      ${p.number}  ${p.customer.companyName}  (${p.folders.filter(f => f.routeKey).length} folder ber-routeKey)`);
  for (const o of opportunities)
    console.log(`    OPPORTUNITY  ${o.number}  ${o.customer.companyName}  [${o.status}]  (${o.folders.filter(f => f.routeKey).length} folder ber-routeKey)`);
  if (projects.length + opportunities.length === 0) console.log("    (kosong — tidak ada pekerjaan sama sekali)");

  console.log("\n" + "=".repeat(70));
  console.log("  3. PENCOCOKAN NAMA FOLDER -> PEKERJAAN");
  console.log("=".repeat(70));
  for (const f of folders) {
    if (/FORMAT FOLDER|ARSIP WHATSAPP/i.test(f.name)) { console.log(`    ${f.name}\n        -> sengaja dilewati`); continue; }
    const ranked = [
      ...projects.map((p) => ({ kind: "PROJECT", ref: p, score: matchScore(f.name, p.customer.companyName) })),
      ...opportunities.map((o) => ({ kind: "OPPORTUNITY", ref: o, score: matchScore(f.name, o.customer.companyName) })),
    ]
      .filter((c) => c.score > 0 && c.ref.folders.some((x) => x.routeKey))
      .sort((a, b) => b.score - a.score || (a.kind === "PROJECT" ? -1 : 1));

    console.log(`    ${f.name}`);
    console.log(`        kata: [${words(f.name).join(", ")}]`);
    if (ranked.length === 0) {
      console.log("        -> TIDAK ADA YANG COCOK");
    } else {
      for (const [i, c] of ranked.slice(0, 3).entries())
        console.log(`        ${i === 0 ? "->" : "  "} ${c.score.toFixed(2)}  ${c.ref.number}  ${c.ref.customer.companyName}${i === 0 ? "   <= dipilih" : ""}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("  4. DOKUMEN YANG SUDAH ADA DI APLIKASI");
  console.log("=".repeat(70));
  const docs = await prisma.document.count({ where: { deletedAt: null } });
  console.log(`    total dokumen aktif : ${docs}`);
  if (docs > 0) {
    const recent = await prisma.document.findMany({
      where: { deletedAt: null },
      orderBy: { uploadedAt: "desc" },
      take: 5,
      select: { originalName: true, uploadedAt: true, folder: { select: { path: true } } },
    });
    for (const d of recent) console.log(`      ${d.uploadedAt.toISOString().slice(0, 10)}  ${d.originalName}  @ ${d.folder?.path ?? "(tanpa folder)"}`);
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
