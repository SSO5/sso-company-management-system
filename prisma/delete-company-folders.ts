/**
 * Permanently deletes the entire "Company Documents" folder tree (kind =
 * COMPANY) — the 8 root folders Administrasi, Arsip, Dokumen Perusahaan, HR,
 * Keuangan, Legal, Marketing, Project and every subfolder under them,
 * confirmed empty of any real business use (Aug 2026 founder decision: the
 * standalone /documents page and this generic company-wide folder structure
 * were replaced by /projects/folders, which only lists per-project folders —
 * see nav.ts and server/documents/documents.ts).
 *
 * Also deletes every real Document (file) still filed under any of these
 * folders, both the DB row AND the actual file in storage (local disk or
 * S3/R2, whichever STORAGE_DRIVER is configured) — same real-delete used by
 * the app's own "permanently delete from trash" action
 * (lib/workflows/documents.ts's permanentlyDeleteDocument), just applied in
 * bulk here since these are being removed as folders, not individually
 * un-trashed first.
 *
 * lib/workflows/folders.ts's ensureCompanyFolders() — which used to silently
 * recreate this whole tree the next time anyone loaded /documents — has
 * already been removed from every call site (see documents.ts), so running
 * this script is safe to do exactly once and stays deleted.
 *
 * Hard delete. Cannot be undone. Confirms with a full inventory + typed
 * "DELETE" before touching anything, same pattern as delete-opportunity.ts.
 *
 * Usage:  npx tsx prisma/delete-company-folders.ts
 */
import { PrismaClient } from "@prisma/client";
import * as readline from "node:readline/promises";
import { getStorageDriver } from "../src/lib/storage";

const prisma = new PrismaClient();

async function main() {
  const roots = await prisma.folder.findMany({ where: { kind: "COMPANY", parentId: null }, orderBy: { name: "asc" } });
  if (roots.length === 0) {
    console.log("No COMPANY folders found — nothing to do (already deleted, or never created).");
    return;
  }

  // Every descendant also has kind "COMPANY" (see createTree in folders.ts),
  // so this single query catches the whole tree regardless of depth.
  const allFolders = await prisma.folder.findMany({ where: { kind: "COMPANY" }, select: { id: true, name: true, parentId: true } });
  const folderIds = allFolders.map((f) => f.id);

  const documents = await prisma.document.findMany({
    where: { folderId: { in: folderIds } },
    select: { id: true, originalName: true, storagePath: true, deletedAt: true },
  });

  console.log(`\nAbout to PERMANENTLY delete the Company Documents folder tree:`);
  console.log(`  Root folders:  ${roots.length} — ${roots.map((r) => r.name).join(", ")}`);
  console.log(`  All folders (incl. subfolders): ${allFolders.length}`);
  console.log(`  Documents (real files) inside:  ${documents.length}`);
  if (documents.length > 0) {
    documents.forEach((d) => console.log(`    - ${d.originalName}${d.deletedAt ? " (already in trash)" : ""}`));
  }
  console.log(`\nThis deletes both the database records AND the actual files in storage. This cannot be undone.`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nType DELETE (all caps) to confirm, anything else to cancel: ');
  rl.close();
  if (answer !== "DELETE") {
    console.log("Cancelled — nothing was deleted.");
    return;
  }

  // Real files first, outside the DB transaction — mirrors
  // permanentlyDeleteDocument's own ordering (storage delete, then DB row).
  // A storage-delete failure here just means a stale blob is left behind
  // (harmless, no dangling DB reference); doing it the other way around
  // could leave a DB row pointing at nothing.
  const driver = getStorageDriver();
  for (const doc of documents) {
    try {
      await driver.delete(doc.storagePath);
    } catch (e) {
      console.warn(`  Warning: could not delete stored file for "${doc.originalName}" (${doc.storagePath}):`, e);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.document.deleteMany({ where: { folderId: { in: folderIds } } });
    await tx.activityLog.createMany({
      data: roots.map((r) => ({
        userId: null,
        action: "DELETE",
        entityType: "FOLDER",
        entityId: r.id,
        description: `Permanently deleted Company Documents folder "${r.name}" and its contents (founder decision, Aug 2026 — replaced by /projects/folders)`,
      })),
    });
    // Deleting the 8 root rows cascades to every descendant folder at the DB
    // level (Folder.parent has onDelete: Cascade — see schema.prisma).
    await tx.folder.deleteMany({ where: { id: { in: roots.map((r) => r.id) } } });
  }, { timeout: 20000, maxWait: 10000 });

  console.log(`\nDone — ${allFolders.length} folders and ${documents.length} documents permanently deleted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
