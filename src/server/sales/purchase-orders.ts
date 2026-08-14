"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { purchaseOrderSchema, contractSchema } from "@/lib/validation/sales";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { uploadDocument } from "@/lib/workflows/documents";
import { isExtractableMimeType } from "@/lib/ai/client";
import { extractPurchaseOrder, type ExtractedPurchaseOrder } from "@/lib/ai/extract-purchase-order";

export async function listPurchaseOrders() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.purchaseOrder.findMany({
    where: { deletedAt: null },
    include: { customer: { select: { companyName: true } }, project: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPurchaseOrder(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = purchaseOrderSchema.parse(input);

    // number is the customer's own PO reference (not auto-generated — see
    // schema.prisma), so the only real duplicate risk is re-entering the
    // same PO for the same customer twice.
    const dup = await prisma.purchaseOrder.findFirst({
      where: { customerId: data.customerId, number: data.number, deletedAt: null },
    });
    if (dup) throw new Error(`PO "${data.number}" untuk customer ini sudah tercatat.`);

    const po = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({ data: { ...data, createdById: actor.userId } });
      await logActivity(tx, {
        userId: actor.userId, action: "CREATE", entityType: "PURCHASE_ORDER", entityId: created.id,
        description: `Created PO ${created.number}`,
      });
      return created;
    });

    revalidatePath("/sales/purchase-orders");
    if (data.projectId) revalidatePath(`/projects/${data.projectId}`);
    return { id: po.id };
  });
}

/**
 * Step 1 of the AI-assisted PO flow (titik masuk pertama — spec: read the
 * document once, let a person confirm before anything financial is saved).
 * Uploads the real file as a Document (same as any other upload — it's
 * useful on its own even if extraction fails) and, if AI extraction
 * succeeds, returns suggested field values for the UI to pre-fill a
 * createPurchaseOrder() confirmation form. This action never creates a
 * PurchaseOrder row itself.
 */
export async function uploadAndExtractPurchaseOrder(
  params: { folderId: string; projectId: string; customerId: string },
  formData: FormData
): Promise<ActionResult<{ documentId: string; extracted: ExtractedPurchaseOrder | null; extractionError: string | null }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "documents", "create");
    requirePermission(actor.role, "sales", "create");

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("Pilih file PO terlebih dahulu.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const doc = await uploadDocument(
      {
        buffer,
        originalName: file.name,
        mimeType,
        folderId: params.folderId,
        projectId: params.projectId,
        relatedEntityType: "PURCHASE_ORDER",
      },
      actor
    );

    let extracted: ExtractedPurchaseOrder | null = null;
    let extractionError: string | null = null;
    if (!isExtractableMimeType(mimeType)) {
      extractionError = "Tipe file ini tidak didukung untuk ekstraksi otomatis (hanya PDF/gambar) — isi data PO secara manual.";
    } else {
      try {
        extracted = await extractPurchaseOrder(buffer, mimeType, file.name);
      } catch (e) {
        extractionError = e instanceof Error ? e.message : "Ekstraksi AI gagal — isi data PO secara manual.";
      }
    }

    revalidatePath(`/projects/${params.projectId}`);
    return { documentId: doc.id, extracted, extractionError };
  });
}

export async function listContracts() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.contract.findMany({
    where: { deletedAt: null },
    include: { customer: { select: { companyName: true } }, project: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createContract(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = contractSchema.parse(input);

    const contract = await prisma.$transaction(async (tx) => {
      const number = await generateNumber(tx, "CONTRACT");
      const created = await tx.contract.create({ data: { ...data, number, createdById: actor.userId } });
      await logActivity(tx, {
        userId: actor.userId, action: "CREATE", entityType: "CONTRACT", entityId: created.id,
        description: `Created contract ${created.number}`,
      });
      return created;
    });

    revalidatePath("/sales/contracts");
    return { id: contract.id };
  });
}
