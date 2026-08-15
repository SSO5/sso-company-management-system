"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { uploadDocument } from "@/lib/workflows/documents";
import { isExtractableMimeType } from "@/lib/ai/client";
import { classifyDocument, type DocumentClassification, type CandidateProject } from "@/lib/ai/classify-document";
import { entityTypeForRouteKey } from "@/lib/workflows/folders";

// DOCUMENT_FOLDER_OPTIONS is NOT re-exported from here — a "use server" file
// may only export async functions, and the client dialog needs this list
// anyway (to render the folder <select>), so it imports
// lib/document-folder-options.ts directly instead of through this module.

async function candidateProjects(): Promise<CandidateProject[]> {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { number: true, name: true, jobNumber: true, customer: { select: { companyName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return projects.map((p) => ({ number: p.number, name: p.name, jobNumber: p.jobNumber, customerName: p.customer.companyName }));
}

/** For pre-populating the confirm-step dropdown even before/instead of an AI call. */
export async function listUploadCandidateProjects(): Promise<CandidateProject[]> {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "documents", "create");
  return candidateProjects();
}

/**
 * Step 1 of "Upload Dokumen (AI)" — the dashboard-wide sibling of
 * uploadAndExtractPurchaseOrder, generalized to ANY document type. Reads the
 * file, asks Claude to guess (project, folder, standardized file name), and
 * returns the suggestion WITHOUT saving anything — unlike the PO flow, the
 * destination folder itself is what's undetermined here, so there's nothing
 * safe to persist yet. The file is kept in the browser (React state) between
 * this call and confirmSmartUpload, not staged server-side.
 */
export async function classifyUploadWithAI(formData: FormData): Promise<
  ActionResult<{
    fileName: string;
    mimeType: string;
    extracted: DocumentClassification | null;
    extractionError: string | null;
    projects: CandidateProject[];
  }>
> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "documents", "create");

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("Pilih file terlebih dahulu.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const projects = await candidateProjects();

    if (!isExtractableMimeType(mimeType)) {
      return {
        fileName: file.name,
        mimeType,
        extracted: null,
        extractionError: "Tipe file ini tidak didukung untuk klasifikasi otomatis (hanya PDF/gambar) — pilih project dan folder secara manual.",
        projects,
      };
    }

    try {
      const extracted = await classifyDocument(buffer, mimeType, file.name, projects);
      return { fileName: file.name, mimeType, extracted, extractionError: null, projects };
    } catch (e) {
      return {
        fileName: file.name,
        mimeType,
        extracted: null,
        extractionError: e instanceof Error ? e.message : "Klasifikasi AI gagal — pilih project dan folder secara manual.",
        projects,
      };
    }
  });
}

/**
 * Step 2 — human has reviewed/edited the AI's suggestion (or filled it in
 * manually if extraction failed/was skipped). Resolves the real Folder row
 * for the chosen project + routeKey, then uploads via the same core
 * uploadDocument() workflow every other upload path uses.
 */
export async function confirmSmartUpload(
  params: { projectNumber: string; routeKey: string; fileName: string },
  formData: FormData
): Promise<ActionResult<{ id: string; folderPath: string; projectId: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "documents", "create");

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("File hilang — coba upload ulang.");
    if (!params.projectNumber) throw new Error("Pilih project tujuan.");
    if (!params.routeKey) throw new Error("Pilih folder tujuan.");
    if (!params.fileName.trim()) throw new Error("Nama file tidak boleh kosong.");

    const project = await prisma.project.findFirst({ where: { number: params.projectNumber, deletedAt: null } });
    if (!project) throw new Error(`Project "${params.projectNumber}" tidak ditemukan.`);

    const folder = await prisma.folder.findFirst({ where: { projectId: project.id, routeKey: params.routeKey } });
    if (!folder) throw new Error("Folder tujuan tidak ditemukan untuk project ini — coba pilih folder lain.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const ext = file.name.includes(".") ? file.name.split(".").pop() : null;
    const baseName = params.fileName.trim();
    const finalName = ext && !baseName.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${baseName}.${ext}` : baseName;

    const doc = await uploadDocument(
      {
        buffer,
        originalName: finalName,
        mimeType,
        folderId: folder.id,
        relatedEntityType: entityTypeForRouteKey(params.routeKey) ?? null,
      },
      actor
    );

    revalidatePath(`/projects/${project.id}`);
    revalidatePath("/dashboard");
    return { id: doc.id, folderPath: folder.path, projectId: project.id };
  });
}
