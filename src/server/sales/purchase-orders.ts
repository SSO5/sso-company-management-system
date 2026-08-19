"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { purchaseOrderSchema, purchaseOrderUpdateSchema, contractSchema } from "@/lib/validation/sales";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { uploadDocument } from "@/lib/workflows/documents";
import { isExtractableMimeType } from "@/lib/ai/client";
import { extractPurchaseOrder, type ExtractedPurchaseOrder } from "@/lib/ai/extract-purchase-order";
import { hasUploadedCustomerPoDocument } from "@/lib/workflows/quotation";

/**
 * PO status for the Quotation detail page's "Customer PO" panel — same
 * "real file, not just typed numbers" check markQuotationWon's gate uses
 * (see hasUploadedCustomerPoDocument), plus the per-PO breakdown so the UI
 * can show which record actually has a file versus which was hand-typed.
 */
export async function getCustomerPoStatusForQuotation(quotationId: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");

  const pos = await prisma.purchaseOrder.findMany({
    where: { quotationId, deletedAt: null },
    select: { id: true, number: true, poDate: true, poValue: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  const poIds = pos.map((p) => p.id);
  const docs = poIds.length
    ? await prisma.document.findMany({
        where: { relatedEntityType: "PURCHASE_ORDER", relatedEntityId: { in: poIds }, deletedAt: null },
        select: { relatedEntityId: true },
      })
    : [];
  const withDocument = new Set(docs.map((d) => d.relatedEntityId));
  const purchaseOrders = pos.map((p) => ({ ...p, hasDocument: withDocument.has(p.id) }));

  return {
    purchaseOrders: JSON.parse(JSON.stringify(purchaseOrders)) as Array<{
      id: string; number: string; poDate: string; poValue: string; status: string; hasDocument: boolean;
    }>,
    hasUploadedDocument: await hasUploadedCustomerPoDocument(prisma, quotationId),
  };
}

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

    const { documentId, ...poData } = data;
    const po = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({ data: { ...poData, createdById: actor.userId } });
      // Tag the source Document (saved earlier by uploadAndExtractPurchaseOrder)
      // with this PO's id, so markQuotationWon's "a real PO file must be on
      // file" gate can find it — see lib/workflows/quotation.ts.
      if (documentId) {
        await tx.document.update({ where: { id: documentId }, data: { relatedEntityId: created.id } });
      }
      await logActivity(tx, {
        userId: actor.userId, action: "CREATE", entityType: "PURCHASE_ORDER", entityId: created.id,
        description: `Created PO ${created.number}${documentId ? " (dengan file PO terupload)" : ""}`,
      });
      return created;
    });

    revalidatePath("/sales/purchase-orders");
    if (data.projectId) revalidatePath(`/projects/${data.projectId}`);
    return { id: po.id };
  });
}

/**
 * Edits an existing PurchaseOrder — the missing piece that made "correct the
 * real DP date" impossible before Aug 2026 (only create/delete existed).
 *
 * The whole point: when poDate or estimatedDeliveryDate actually changes,
 * every linked ProjectMilestone (see backfill-milestones.ts / the schema
 * comment on ProjectMilestone.sourcePurchaseOrderId) is cascade-updated in
 * the SAME transaction, so the Milestones tab / S-Curve / dashboard progress
 * card never drift out of sync with the PO that's their source of truth.
 *
 * Everything else that depends on these dates — Sisa Penagihan, Accounts
 * Receivable, Invoices/Payments' "belum ditagih" banner, the dashboard's
 * billing-schedule card, and the BILLING_DUE_SOON notification — reads
 * PurchaseOrder fresh on every request (see computeBillingSchedule), so
 * those update automatically with zero extra code once this write lands;
 * they were never a second copy of the date to begin with.
 *
 * Already-ISSUED Invoice documents are deliberately NOT touched here — an
 * invoice's own due date is a real commercial commitment already sent to
 * the customer, and silently rewriting it would be wrong. Only the
 * forward-looking "what's next / not yet invoiced" numbers move.
 */
export async function updatePurchaseOrder(id: string, input: unknown): Promise<ActionResult<{ id: string; projectId: string | null }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");

    const existing = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (existing.deletedAt) throw new Error("PO ini sudah dihapus.");
    const data = purchaseOrderUpdateSchema.parse(input);

    if (data.number !== existing.number) {
      const dup = await prisma.purchaseOrder.findFirst({
        where: { customerId: existing.customerId, number: data.number, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new Error(`PO "${data.number}" untuk customer ini sudah tercatat.`);
    }

    const poDateChanged = data.poDate.getTime() !== existing.poDate.getTime();
    const deliveryDateChanged =
      (data.estimatedDeliveryDate?.getTime() ?? null) !== (existing.estimatedDeliveryDate?.getTime() ?? null);

    await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({ where: { id }, data });

      if (poDateChanged) {
        const linked = await tx.projectMilestone.findMany({ where: { sourcePurchaseOrderId: id, dateBasis: "PO_DATE" } });
        for (const m of linked) {
          await tx.projectMilestone.update({
            where: { id: m.id },
            data: {
              dueDate: updated.poDate,
              // completedAt on a PO_DATE-linked milestone was itself derived
              // from the (now-corrected) poDate, never a separately-recorded
              // real event — keep it in lockstep so "Realisasi" on the
              // S-Curve doesn't silently disagree with the PO.
              ...(m.status === "COMPLETED" ? { completedAt: updated.poDate } : {}),
            },
          });
        }
      }
      if (deliveryDateChanged) {
        const linked = await tx.projectMilestone.findMany({
          where: { sourcePurchaseOrderId: id, dateBasis: "ESTIMATED_DELIVERY" },
        });
        for (const m of linked) {
          await tx.projectMilestone.update({ where: { id: m.id }, data: { dueDate: updated.estimatedDeliveryDate } });
        }
      }

      await logActivity(tx, {
        userId: actor.userId, action: "UPDATE", entityType: "PURCHASE_ORDER", entityId: id,
        description: `Updated PO ${updated.number}${poDateChanged || deliveryDateChanged ? " (tanggal berubah, milestone terkait ikut diperbarui)" : ""}`,
      });
    });

    revalidatePath("/sales/purchase-orders");
    revalidatePath("/finance/receivables");
    revalidatePath("/finance/invoices");
    revalidatePath("/finance/payments");
    revalidatePath("/dashboard");
    if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);
    return { id, projectId: existing.projectId };
  });
}

/**
 * Soft-deletes a wrongly-entered PurchaseOrder — e.g. a duplicate created
 * with an SSO-invented number before the "number = customer's own PO
 * reference" rule existed, sitting alongside the real one and double-
 * counting the project's PO total. Soft delete (deletedAt), not a hard
 * delete, so the mistake stays visible in the audit trail via logActivity
 * rather than silently vanishing.
 */
export async function deletePurchaseOrder(id: string): Promise<ActionResult<{ id: string; projectId: string | null }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "delete");

    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (po.deletedAt) throw new Error("PO ini sudah dihapus sebelumnya.");

    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({ where: { id }, data: { deletedAt: new Date() } });
      await logActivity(tx, {
        userId: actor.userId, action: "DELETE", entityType: "PURCHASE_ORDER", entityId: id,
        description: `Deleted PO ${po.number}`,
      });
    });

    revalidatePath("/sales/purchase-orders");
    if (po.projectId) revalidatePath(`/projects/${po.projectId}`);
    return { id, projectId: po.projectId };
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
 *
 * `projectId` is optional because this now also runs pre-Won, from a
 * Quotation/Opportunity that has no Project yet (see markQuotationWon's
 * "real PO file must be on file" gate) — the caller passes the right
 * `folderId` either way (the Project's or the Opportunity's own "5. PO"
 * folder), so projectId here is only used when it's actually available.
 */
export async function uploadAndExtractPurchaseOrder(
  params: { folderId: string; customerId: string; projectId?: string },
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

    if (params.projectId) revalidatePath(`/projects/${params.projectId}`);
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
    // "Active" is only reachable through activateContractAction below, which
    // requires the actually-signed document — never set directly here, even
    // if a caller bypasses the create form's own restriction.
    if (data.status === "ACTIVE") {
      throw new Error('Kontrak tidak bisa langsung dibuat berstatus Active — gunakan tombol "Aktifkan" setelah kontrak dibuat, yang mewajibkan upload dokumen kontrak yang sudah ditandatangani.');
    }

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

/**
 * Draft -> Active, gated on the actually-signed document being uploaded
 * right here (spec: "evidence before the system treats something as done").
 * Unlike the PO-before-Won gate, this one is a single atomic step — the
 * upload and the status change happen in the same action — rather than a
 * separate check against whatever might already be on file, since a
 * contract can only ever be activated once (no re-activation path exists).
 */
export async function activateContractAction(id: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    requirePermission(actor.role, "documents", "create");

    const contract = await prisma.contract.findUniqueOrThrow({ where: { id } });
    if (contract.status !== "DRAFT") {
      throw new Error(`Kontrak ${contract.number} berstatus ${contract.status}, bukan Draft — tidak bisa diaktifkan dari sini.`);
    }

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("Upload dokumen kontrak yang sudah ditandatangani terlebih dahulu.");

    const doc = await uploadDocument(
      {
        buffer: Buffer.from(await file.arrayBuffer()),
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        projectId: contract.projectId,
        relatedEntityType: "CONTRACT",
        relatedEntityId: contract.id,
      },
      actor
    );

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({ where: { id }, data: { status: "ACTIVE" } });
      await logActivity(tx, {
        userId: actor.userId,
        action: "STATUS_CHANGE",
        entityType: "CONTRACT",
        entityId: id,
        description: `${contract.number}: Draft -> Active (dokumen tertandatangani: "${doc.originalName}")`,
      });
    });

    revalidatePath("/sales/contracts");
    if (contract.projectId) revalidatePath(`/projects/${contract.projectId}`);
    return { id };
  });
}
