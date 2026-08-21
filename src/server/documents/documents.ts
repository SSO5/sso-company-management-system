"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import {
  uploadDocument, moveDocumentToTrash, restoreDocumentFromTrash, permanentlyDeleteDocument,
} from "@/lib/workflows/documents";
import { entityTypeForRouteKey } from "@/lib/workflows/folders";
import { runAction, type ActionResult } from "@/lib/action-helpers";

export async function getFolderView(folderId: string | null) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "documents", "view");

  const folder = folderId
    ? await prisma.folder.findUniqueOrThrow({
        where: { id: folderId },
        include: { project: { select: { opportunityId: true } } },
      })
    : null;
  const [children, documents, breadcrumbs] = await Promise.all([
    prisma.folder.findMany({ where: { parentId: folderId }, orderBy: { name: "asc" } }),
    folderId
      ? prisma.document.findMany({
          where: { folderId, deletedAt: null },
          include: { uploadedBy: { select: { name: true } } },
          orderBy: { uploadedAt: "desc" },
        })
      : [],
    buildBreadcrumbs(folderId),
  ]);

  // Costing sheets and Quotations are records, not uploaded Documents — they
  // don't live in the `documents` list above. Spec: these are created FROM
  // WITHIN the Opportunity's own "3. Costing" / "4. Quotation" folders, so
  // surface them (and a "create new" entry point) right here instead of the
  // old global list pages.
  //
  // The same "3. Costing" / "4. Quotation" folders keep existing after a Won
  // deal too — they just get reparented from the Opportunity's tree into the
  // Project's "01 Sales" section (see mergeOpportunityFoldersIntoProject).
  // CostingSheet/Quotation rows are only ever linked by opportunityId (never
  // projectId), so once inside a Project folder we resolve the opportunityId
  // via the Project itself instead of the (by-then-deleted) Opportunity
  // folder — otherwise the records look like they "disappeared" post-Won,
  // even though nothing was actually deleted.
  const salesOpportunityId =
    folder?.kind === "OPPORTUNITY" ? folder.opportunityId : folder?.kind === "PROJECT" ? folder.project?.opportunityId ?? null : null;

  // Each also carries its full revisionHistory (past, superseded revisions)
  // so the folder view can list R1/R2/.../current as separate rows instead
  // of only the current one — every past revision stays openable/printable
  // as its own PDF (see /api/costing/[id]/pdf and /api/quotations/[id]/pdf's
  // ?revision= param), matching the multi-file history spec.2 already used
  // manually elsewhere in this folder for hand-uploaded document revisions.
  let costingSheets: Awaited<ReturnType<typeof getCostingSheetsForFolder>> = [];
  let quotations: Awaited<ReturnType<typeof getQuotationsForFolder>> = [];
  if (salesOpportunityId) {
    if (folder?.routeKey === "SALES/COSTING") {
      costingSheets = await getCostingSheetsForFolder(salesOpportunityId);
    } else if (folder?.routeKey === "SALES/QUOTATION") {
      quotations = await getQuotationsForFolder(salesOpportunityId);
    }
  }

  return { folder, children, documents, breadcrumbs, costingSheets, quotations, salesOpportunityId };
}

function getCostingSheetsForFolder(opportunityId: string) {
  return prisma.costingSheet.findMany({
    where: { opportunityId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { revisionHistory: { orderBy: { revision: "desc" } } },
  });
}

function getQuotationsForFolder(opportunityId: string) {
  return prisma.quotation.findMany({
    where: { opportunityId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { revisionHistory: { orderBy: { revision: "desc" } } },
  });
}

async function buildBreadcrumbs(folderId: string | null) {
  const chain: { id: string; name: string }[] = [];
  let current = folderId;
  while (current) {
    const f = await prisma.folder.findUnique({ where: { id: current }, select: { id: true, name: true, parentId: true } });
    if (!f) break;
    chain.unshift({ id: f.id, name: f.name });
    current = f.parentId;
  }
  return chain;
}

/**
 * Aug 2026: this used to also return `companyFolders` (Administrasi, HR,
 * Legal, etc.) alongside these. That whole "Company Documents" grid was
 * removed at the founder's request — it sat unused since launch (see
 * prisma/delete-company-folders.ts) and having a second, no-longer-existing
 * document root just created a page nobody needed. Project folders are the
 * only thing that lived under the old global /documents page worth keeping,
 * so they moved to /projects/folders — reached from "Pekerjaan" in the nav,
 * where the rest of the job lifecycle already lives.
 */
export async function getProjectFolders() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "documents", "view");

  // Opportunity folders are intentionally NOT listed here (spec: they live
  // inside each Opportunity's own card at /sales/opportunities/[id] pre-Won,
  // then automatically migrate into the matching Project folder the moment
  // the deal is Won — see mergeOpportunityFoldersIntoProject). Listing them
  // here too would just be a second, soon-stale path to the same data.
  const projectFolders = await prisma.folder.findMany({
    // A Project soft-deleted (e.g. after a wrongly-Won deal is corrected —
    // see correctOpportunityStage in lib/workflows/corrections.ts) must not
    // keep showing up here just because its Folder row is still on disk;
    // Folder has no deletedAt of its own, so this has to filter through the
    // relation instead.
    where: { kind: "PROJECT", parentId: null, project: { deletedAt: null } },
    include: { project: { select: { number: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
  return { projectFolders };
}

export async function uploadDocumentToFolder(folderId: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "documents", "create");

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("Please choose a file to upload.");

    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await uploadDocument(
      {
        buffer,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        description: String(formData.get("description") || ""),
        folderId,
        // Tag the document with the entity type implied by the folder it
        // was dropped into (e.g. "06 Closing / BAST" -> "BAST"), so
        // validateProjectClosing() can find it later even though this is a
        // generic folder upload rather than an entity-specific flow.
        relatedEntityType: entityTypeForRouteKey(folder?.routeKey),
      },
      actor
    );

    revalidatePath(`/documents/${folderId}`);
    return { id: doc.id };
  });
}

export async function trashDocument(id: string, folderId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "documents", "delete");
    await moveDocumentToTrash(id, actor);
    revalidatePath(`/documents/${folderId}`);
    revalidatePath("/documents/trash");
    return { id };
  });
}

export async function listTrash() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "documents", "view");
  return prisma.document.findMany({
    where: { deletedAt: { not: null } },
    include: { deletedBy: { select: { name: true } }, folder: { select: { path: true } } },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreDocument(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "documents", "update");
    await restoreDocumentFromTrash(id, actor);
    revalidatePath("/documents/trash");
    return { id };
  });
}

export async function permanentDelete(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "documents", "delete");
    await permanentlyDeleteDocument(id, actor);
    revalidatePath("/documents/trash");
    return { id };
  });
}
