/**
 * Bulk-import the PROSPEK 2026 folder tree into SSO Connect.
 *
 * Runs on YOUR machine, not in the cloud: it reads files from the local
 * OneDrive path, pushes each one through the app's own uploadDocument()
 * workflow (so storage, Document rows, folder routing and the activity log
 * all behave exactly as if a person had uploaded it), then writes one
 * Notification per active user summarising what landed.
 *
 * --------------------------------------------------------------------------
 * READ THIS BEFORE RUNNING
 * --------------------------------------------------------------------------
 * The app defaults to STORAGE_DRIVER=local, which writes to disk. On Vercel
 * that silently fails: the serverless filesystem is ephemeral, so files are
 * written and then vanish, while the Document row survives and points at
 * nothing. You end up with a database full of documents that will not open.
 *
 * This script therefore REFUSES to run against a local driver unless you pass
 * --i-know-storage-is-local. Set STORAGE_DRIVER=s3 plus the S3_* variables
 * (Cloudflare R2 is the cheapest fit) in BOTH .env and Vercel first.
 * --------------------------------------------------------------------------
 *
 * Usage:
 *   npx tsx prisma/import-documents.ts --root="C:\\Users\\Sulton\\OneDrive - PT. Petrindo Semesta\\PT SSO\\PROSPEK 2026"
 *   npx tsx prisma/import-documents.ts --root="..." --apply
 *   npx tsx prisma/import-documents.ts --root="..." --apply --only="2. PT JAKARTA"
 *
 * Without --apply it prints the full plan and writes nothing.
 */
import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { uploadDocument } from "../src/lib/workflows/documents";
import { MAX_FILE_SIZE_BYTES } from "../src/lib/storage";
import type { SessionPayload } from "../src/lib/auth/session";

const prisma = new PrismaClient();

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const [, ...rest] = hit.split("=");
  return rest.length ? rest.join("=") : "";
}

/**
 * Physical folder name -> routeKey. Keys are matched case-insensitively as
 * substrings against the RELATIVE path inside a customer folder, most
 * specific first, so both the tidied layout ("01 Sales/4. Quotation") and the
 * older one ("4.Quotation") resolve to the same slot.
 */
const ROUTE_RULES: { match: RegExp; routeKey: string }[] = [
  { match: /dokumen legal customer/i, routeKey: "SALES/DATA_INPUT" },
  { match: /data\s*input/i, routeKey: "SALES/DATA_INPUT" },
  { match: /engineering/i, routeKey: "SALES/ENGINEERING" },
  { match: /costing/i, routeKey: "SALES/COSTING" },
  { match: /quotation/i, routeKey: "SALES/QUOTATION" },
  { match: /dokumen kontrak|contract/i, routeKey: "SALES/CONTRACT" },
  { match: /progress report/i, routeKey: "PROJECT/PROGRESS_REPORT" },
  { match: /meeting/i, routeKey: "PROJECT/MEETING" },
  { match: /timeline/i, routeKey: "PROJECT/TIMELINE" },
  { match: /project plan/i, routeKey: "PROJECT/PROJECT_PLAN" },
  { match: /deliverable/i, routeKey: "PROJECT/DELIVERABLES" },
  { match: /invoice/i, routeKey: "FINANCE/INVOICE" },
  { match: /payment/i, routeKey: "FINANCE/PAYMENT" },
  { match: /financial document/i, routeKey: "FINANCE/FINANCIAL_DOCUMENTS" },
  { match: /procurement|procurment/i, routeKey: "PROCUREMENT" },
  { match: /bast/i, routeKey: "CLOSING/BAST" },
  { match: /final report/i, routeKey: "CLOSING/FINAL_REPORT" },
  { match: /project closure/i, routeKey: "CLOSING/PROJECT_CLOSURE" },
  { match: /documentation|foto|video/i, routeKey: "DOCUMENTATION" },
  // "5. PO" is last: it is two characters and would otherwise match
  // "PO" inside words like "Report" or "Proposal" via a looser rule.
  { match: /(^|[\/\\])\d*\.?\s*PO([\/\\]|$)/i, routeKey: "SALES/PO" },
];

function routeKeyFor(relPath: string): string | null {
  for (const r of ROUTE_RULES) if (r.match.test(relPath)) return r.routeKey;
  return null;
}

// Only what lib/storage.ts actually accepts. Anything else (mp4/mov video,
// .PDF-in-a-zip, stray .db files) is reported as skipped rather than failing
// mid-run — a partial import that stops halfway is worse than a complete one
// with a known, listed exclusion set.
const ALLOWED = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "jpg", "jpeg", "png", "webp", "zip", "txt",
  "mp4", "mov", "webm",
]);

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip", txt: "text/plain",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};

/**
 * Directory detection uses fs.stat(), NOT Dirent.isDirectory().
 *
 * OneDrive Files On-Demand stores folders as reparse points. readdir returns
 * a Dirent whose isDirectory() is false and isSymbolicLink() is true, so the
 * obvious `entry.isDirectory()` check silently walks past every folder and
 * reports "0 files found" against a directory tree that plainly has files in
 * it. fs.stat() follows the reparse point and answers correctly.
 */
async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false; // cloud-only placeholder that failed to hydrate
  }
}

async function walk(dir: string, base = dir): Promise<{ full: string; rel: string }[]> {
  const out: { full: string; rel: string }[] = [];
  for (const name of await fs.readdir(dir)) {
    if (name.startsWith(".") || /_STRUKTUR LAMA/i.test(name)) continue;
    const full = path.join(dir, name);
    if (await isDir(full)) out.push(...(await walk(full, base)));
    else out.push({ full, rel: path.relative(base, full) });
  }
  return out;
}

/** Normalises "2. PT JAKARTA PRIMA CRANES" / "PT. Jakarta Prima Cranes" to a comparable token. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/^\d+\.\s*/, "").replace(/\bpt\.?\s*/g, "").replace(/[^a-z0-9]/g, "");
}

async function main() {
  const root = flag("root");
  const apply = flag("apply") !== undefined;
  const only = flag("only");
  const allowLocal = flag("i-know-storage-is-local") !== undefined;

  if (!root) {
    console.error('Usage: npx tsx prisma/import-documents.ts --root="<path to PROSPEK 2026>" [--apply] [--only="2. PT JAKARTA"]');
    process.exit(1);
  }

  const driver = process.env.STORAGE_DRIVER || "local";
  if (driver !== "s3" && !allowLocal) {
    console.error(
      `\nSTORAGE_DRIVER is "${driver}".\n\n` +
        "On Vercel that means every file you import is written to a disk that is\n" +
        "thrown away between requests. The Document rows would survive and point at\n" +
        "files that no longer exist — the app would look full and open nothing.\n\n" +
        "Set STORAGE_DRIVER=s3 plus S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY /\n" +
        "S3_ENDPOINT / S3_REGION in .env AND in the Vercel project settings first.\n" +
        "(Cloudflare R2 is the cheapest fit — see .env.example for the exact values.)\n\n" +
        "If you are importing into a local dev database on purpose, re-run with\n" +
        "--i-know-storage-is-local.\n"
    );
    process.exit(1);
  }

  // Import as the founder's account so the audit trail names a real person.
  const importer = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!importer) { console.error("No active ADMIN user found to attribute the import to."); process.exit(1); }
  const actor: SessionPayload = {
    userId: importer.id, email: importer.email, name: importer.name, role: importer.role,
  };

  // Map every customer-level folder on disk to a Project or Opportunity.
  const [projects, opportunities] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, number: true, name: true, customer: { select: { companyName: true } }, folders: { select: { id: true, routeKey: true } } },
    }),
    prisma.opportunity.findMany({
      where: { deletedAt: null },
      select: { id: true, number: true, name: true, customer: { select: { companyName: true } }, folders: { select: { id: true, routeKey: true } } },
    }),
  ]);

  // "0. ARSIP WHATSAPP PERUSAHAAN" is excluded deliberately: it holds the raw
  // 567MB group-chat exports, which are company-wide rather than per-customer,
  // exceed the 50MB ceiling anyway, and whose useful contents were already
  // extracted into the per-job folders. FORMAT FOLDER is an empty template.
  console.log(`\nFolder sumber: ${root}`);
  let rootEntries: string[];
  try {
    rootEntries = await fs.readdir(root);
  } catch (e) {
    console.error(`\nTidak bisa membaca folder tersebut: ${(e as Error).message}`);
    console.error("Periksa path-nya, atau jalankan dengan --root=\"<path lengkap>\".\n");
    process.exit(1);
  }

  const topLevel: { name: string }[] = [];
  for (const name of rootEntries) {
    if (name.startsWith(".") || !(await isDir(path.join(root, name)))) continue;
    if (/FORMAT FOLDER|ARSIP WHATSAPP/i.test(name)) continue;
    if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
    topLevel.push({ name });
  }

  console.log(`Isi folder: ${rootEntries.length} entri, ${topLevel.length} folder pelanggan yang akan diproses.`);
  if (topLevel.length === 0) {
    // Reporting "0 files" without saying why is what made the first failed run
    // look like an empty folder rather than a detection bug.
    console.error(
      "\nTidak ada folder pelanggan yang terbaca. Entri yang ditemukan di folder sumber:\n  " +
        (rootEntries.join("\n  ") || "(kosong)") +
        "\n\nJika nama-nama di atas terlihat benar, kemungkinan folder OneDrive masih berstatus " +
        "cloud-only. Klik kanan folder PROSPEK 2026 di Explorer lalu pilih " +
        "\"Always keep on this device\", tunggu sinkronisasi selesai, dan jalankan ulang.\n"
    );
    process.exit(1);
  }

  interface PlanRow { file: string; rel: string; target: string; folderId: string; size: number }
  const plan: PlanRow[] = [];
  const skipped: { file: string; why: string }[] = [];

  for (const dir of topLevel) {
    const token = normalizeName(dir.name);
    // Prefer a Project (post-Won) over an Opportunity when both match — a Won
    // deal's folders are the ones that survive, and the Opportunity tree is
    // deleted by mergeOpportunityFoldersIntoProject.
    const match =
      projects.find((p) => normalizeName(p.customer.companyName).includes(token) || token.includes(normalizeName(p.customer.companyName))) ??
      opportunities.find((o) => normalizeName(o.customer.companyName).includes(token) || token.includes(normalizeName(o.customer.companyName)));

    if (!match) {
      skipped.push({ file: dir.name, why: "no matching Project/Opportunity in the database" });
      continue;
    }
    const byRoute = new Map(match.folders.filter((f) => f.routeKey).map((f) => [f.routeKey as string, f.id]));

    for (const f of await walk(path.join(root, dir.name))) {
      const ext = path.extname(f.full).slice(1).toLowerCase();
      if (!ALLOWED.has(ext)) { skipped.push({ file: f.rel, why: `file type .${ext} not accepted by the app` }); continue; }
      const stat = await fs.stat(f.full);
      if (stat.size > MAX_FILE_SIZE_BYTES) { skipped.push({ file: f.rel, why: `${(stat.size / 1024 / 1024).toFixed(0)}MB exceeds the 50MB limit` }); continue; }

      const routeKey = routeKeyFor(f.rel);
      const folderId = routeKey ? byRoute.get(routeKey) : undefined;
      if (!folderId) { skipped.push({ file: f.rel, why: routeKey ? `no "${routeKey}" folder on ${match.number}` : "could not tell which folder this belongs in" }); continue; }

      plan.push({ file: f.full, rel: f.rel, target: `${match.number} · ${routeKey}`, folderId, size: stat.size });
    }
  }

  const totalMb = plan.reduce((s, p) => s + p.size, 0) / 1024 / 1024;
  console.log(`\n${plan.length} file(s) to import (${totalMb.toFixed(1)} MB). ${skipped.length} skipped.`);
  console.log(apply ? `Storage driver: ${driver}\n` : "\n[DRY RUN — nothing will be written]\n");

  const byTarget = new Map<string, number>();
  for (const p of plan) byTarget.set(p.target, (byTarget.get(p.target) ?? 0) + 1);
  for (const [t, n] of [...byTarget].sort()) console.log(`  ${String(n).padStart(4)}  ${t}`);

  if (skipped.length) {
    console.log("\nSkipped:");
    const byWhy = new Map<string, number>();
    for (const s of skipped) byWhy.set(s.why, (byWhy.get(s.why) ?? 0) + 1);
    for (const [w, n] of [...byWhy].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${w}`);
  }

  if (!apply) { console.log("\nDry run only — re-run with --apply to import.\n"); return; }

  // Skip anything already imported, so the script is safe to re-run after a
  // failure without producing duplicates.
  const existing = new Set(
    (await prisma.document.findMany({ where: { deletedAt: null }, select: { originalName: true, folderId: true } }))
      .map((d) => `${d.folderId}::${d.originalName}`)
  );

  let done = 0, dupes = 0, failed = 0;
  for (const p of plan) {
    const name = path.basename(p.file);
    if (existing.has(`${p.folderId}::${name}`)) { dupes++; continue; }
    try {
      const ext = path.extname(name).slice(1).toLowerCase();
      await uploadDocument(
        {
          buffer: await fs.readFile(p.file),
          originalName: name,
          mimeType: MIME[ext] ?? "application/octet-stream",
          description: `Impor massal dari folder PROSPEK 2026 (${path.dirname(p.rel)})`,
          folderId: p.folderId,
        },
        actor
      );
      done++;
      if (done % 25 === 0) console.log(`  ...${done}/${plan.length}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL ${name}: ${(e as Error).message}`);
    }
  }

  console.log(`\nImported ${done}. Already present: ${dupes}. Failed: ${failed}.`);

  // Tell the team, in the app, what just appeared. Without this the import is
  // invisible: files simply exist one day, with no cue that anything changed.
  if (done > 0) {
    const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
    const summary = [...byTarget].sort().map(([t, n]) => `${t.split(" · ")[0]} (${n})`).join(", ");
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: "DOCUMENT_IMPORT",
        title: `${done} dokumen baru diunggah`,
        message: `Arsip PROSPEK 2026 telah dimasukkan ke aplikasi: ${summary}. Buka Kelengkapan Dokumen di beranda untuk melihat apa yang masih kurang.`,
        link: "/dashboard",
      })),
    });
    console.log(`Notified ${users.length} user(s) in-app.`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
