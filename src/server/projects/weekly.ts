"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction } from "@/lib/action-helpers";
import { getStorageDriver } from "@/lib/storage";
import { renderProgressReportPdf } from "@/lib/pdf/render-progress-report-pdf";
import {
  lockReport,
  reportApprover,
  reviewSource,
} from "@/lib/workflows/report-review";
import { logActivity } from "@/lib/workflows/audit";
import { notifyUser } from "@/lib/workflows/notify";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { notificationConfig } from "@/lib/notifications/config";
import { dispatchOutbound } from "@/lib/notifications/dispatch";
import {
  canDecideWeeklyReport,
  canDispatchWeeklyReport,
} from "@/lib/weekly-policy";

export async function getWeeklyProject(projectId: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");
  const [reports, settings, approver] = await Promise.all([
    prisma.progressReport.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        sourceDocument: {
          select: {
            id: true,
            originalName: true,
            progressFormat: true,
            uploadedAt: true,
            deletedAt: true,
          },
        },
        reviews: { orderBy: { version: "desc" }, include: { dispatch: true } },
      },
    }),
    prisma.projectWeeklySettings.findUnique({ where: { projectId } }),
    reportApprover(),
  ]);
  const fingerprints = new Map(
    await Promise.all(
      reports
        .filter((r) => r.reviews.length)
        .map(
          async (r) =>
            [r.id, (await reviewSource(prisma, r.id)).fingerprint] as const,
        ),
    ),
  );
  // Never serialize private object-storage keys, approval snapshots or hashes to clients.
  return {
    actorId: actor.userId,
    isApprover: actor.userId === approver?.id,
    approverName: approver?.name ?? null,
    settings,
    reports: reports.map((r) => ({
      id: r.id,
      number: r.number,
      inspectionDate: r.inspectionDate,
      dateVerified: r.dateVerified,
      createdAt: r.createdAt,
      summary: r.summary,
      source: r.sourceDocument,
      items: r.items.map((i) => ({
        id: i.id,
        sectionName: i.sectionName,
        partName: i.partName,
        quantity: i.quantity,
        notes: i.notes,
        isDone: i.isDone,
      })),
      reviews: r.reviews.map((v) => ({
        id: v.id,
        version: v.version,
        status: v.status,
        isCurrent: fingerprints.get(r.id) === v.fingerprint,
        requestedAt: v.requestedAt,
        decidedAt: v.decidedAt,
        decisionNote: v.decisionNote,
        notificationStatus: v.notificationStatus,
        dispatch: v.dispatch,
      })),
    })),
  };
}

export async function requestReportReview(reportId: string) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const approver = await reportApprover();
    if (!approver)
      throw new Error("Akun direktur pemberi persetujuan belum tersedia.");
    const before = await reviewSource(prisma, reportId);
    if (!before.report.dateVerified)
      throw new Error(
        "Periksa tanggal laporan melalui Periksa draf sebelum mengajukan persetujuan.",
      );
    if (!before.report.items.length)
      throw new Error(
        "Laporan belum berisi rincian pekerjaan untuk diperiksa.",
      );
    const existing = await prisma.progressReportReview.findFirst({
      where: {
        reportId,
        fingerprint: before.fingerprint,
        status: { in: ["PENDING", "APPROVED"] },
      },
      orderBy: { version: "desc" },
    });
    if (existing) return { id: existing.id };
    const { buffer, fileName } = await renderProgressReportPdf(reportId, {
      reviewCopy: true,
    });
    const driver = getStorageDriver();
    const saved = await driver.save(buffer, {
      originalName: fileName,
      mimeType: "application/pdf",
    });
    let review;
    try {
      review = await prisma.$transaction(
        async (tx) => {
          await lockReport(tx, reportId);
          const current = await reviewSource(tx, reportId);
          if (current.fingerprint !== before.fingerprint)
            throw new Error(
              "Isi laporan berubah saat diproses. Periksa dan ajukan lagi.",
            );
          const duplicate = await tx.progressReportReview.findFirst({
            where: {
              reportId,
              fingerprint: before.fingerprint,
              status: { in: ["PENDING", "APPROVED"] },
            },
          });
          if (duplicate)
            throw new Error("Versi ini sudah diajukan. Muat ulang halaman.");
          const last = await tx.progressReportReview.aggregate({
            where: { reportId },
            _max: { version: true },
          });
          await tx.progressReportReview.updateMany({ where: { reportId, status: "PENDING" }, data: { status: "SUPERSEDED" } });
          const created = await tx.progressReportReview.create({
            data: {
              reportId,
              version: (last._max.version ?? 0) + 1,
              fingerprint: before.fingerprint,
              snapshot: before.snapshot,
              pdfKey: saved.storageKey,
              pdfHash: createHash("sha256").update(buffer).digest("hex"),
              approverId: approver.id,
              requestedById: actor.userId,
            },
          });
          await notifyUser(tx, {
            userId: approver.id,
            type: "PROGRESS_REPORT_APPROVAL",
            title: "Laporan menunggu persetujuan",
            message: `${before.report.number} · versi ${created.version}`,
            link: `/projects/${before.report.projectId}?tab=progress&review=${created.id}`,
          });
          await logActivity(tx, {
            userId: actor.userId,
            action: "CREATE",
            entityType: "REPORT_REVIEW",
            entityId: created.id,
            description: `Mengajukan ${before.report.number} versi ${created.version} kepada ${approver.name}`,
          });
          return created;
        },
        { timeout: 20000 },
      );
    } catch (error) {
      await driver.delete(saved.storageKey).catch(() => {});
      throw error;
    }
    const config = notificationConfig();
    let notificationStatus = "NOT_CONFIGURED";
    if (config.enabled && config.whatsappReady && approver.whatsappNumber) {
      const accepted = await sendWhatsApp({
        to: approver.whatsappNumber,
        recipientName: approver.name,
        title: "Persetujuan laporan SSO",
        message: `${before.report.number}, versi ${review.version}, menunggu pemeriksaan Anda. Buka laporan lalu pilih Setujui atau Minta revisi.`,
        link: `/projects/${before.report.projectId}?tab=progress&review=${review.id}`,
      }).catch(() => false);
      notificationStatus = accepted ? "PROVIDER_ACCEPTED" : "FAILED";
    }
    await prisma.progressReportReview.update({
      where: { id: review.id },
      data: { notificationStatus },
    });
    revalidatePath(`/projects/${before.report.projectId}`);
    revalidatePath("/dashboard");
    return { id: review.id };
  });
}

export async function decideReportReview(
  id: string,
  decision: "APPROVED" | "REJECTED",
  note: string,
) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const approver = await reportApprover();
    if (actor.userId !== approver?.id)
      throw new Error(
        "Hanya F Yudianto yang dapat memberi persetujuan laporan.",
      );
    z.enum(["APPROVED", "REJECTED"]).parse(decision);
    const reason = z.string().trim().max(2000).parse(note);
    if (decision === "REJECTED" && !reason)
      throw new Error("Tuliskan bagian yang perlu direvisi.");
    const result = await prisma.$transaction(
      async (tx) => {
        const review = await tx.progressReportReview.findUniqueOrThrow({
          where: { id },
        });
        await lockReport(tx, review.reportId);
        const current = await reviewSource(tx, review.reportId);
        if (current.fingerprint !== review.fingerprint)
          throw new Error(
            "Draf telah berubah. Ajukan versi terbaru untuk persetujuan.",
          );
        if (
          !canDecideWeeklyReport(
            actor.userId,
            review.approverId,
            review.status,
            review.fingerprint,
            current.fingerprint,
          )
        )
          throw new Error(
            "Permintaan sudah diputuskan atau bukan untuk akun Anda.",
          );
        const changed = await tx.progressReportReview.updateMany({
          where: { id, approverId: actor.userId, status: "PENDING" },
          data: {
            status: decision,
            decidedById: actor.userId,
            decidedAt: new Date(),
            decisionNote: reason || null,
          },
        });
        if (!changed.count)
          throw new Error(
            "Permintaan ini sudah diputuskan atau bukan untuk akun Anda.",
          );
        await logActivity(tx, {
          userId: actor.userId,
          action: "STATUS_CHANGE",
          entityType: "REPORT_REVIEW",
          entityId: id,
          description: `${decision === "APPROVED" ? "Menyetujui" : "Meminta revisi"} ${current.report.number} versi ${review.version}`,
          metadata: { note: reason },
        });
        await notifyUser(tx, {
          userId: review.requestedById,
          type: "PROGRESS_REPORT_DECISION",
          title:
            decision === "APPROVED"
              ? "Laporan disetujui"
              : "Laporan perlu revisi",
          message: reason || current.report.number,
          link: `/projects/${current.report.projectId}?tab=progress&review=${id}`,
        });
        return current.report.projectId;
      },
      { timeout: 20000 },
    );
    revalidatePath(`/projects/${result}`);
    revalidatePath("/dashboard");
    return { id };
  });
}

export async function recordReportDispatch(input: unknown) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const data = z
      .object({
        reviewId: z.string(),
        recipient: z.string().trim().min(1).max(200),
        channel: z.enum(["WhatsApp", "Email"]),
        sentAt: z.coerce.date().optional(),
        note: z.string().trim().max(2000).optional(),
      })
      .parse(input);
    const now = new Date(),
      sentAt = data.sentAt ?? now;
    if (sentAt.getTime() > now.getTime() + 60000)
      throw new Error("Waktu kirim tidak boleh di masa depan.");
    const result = await prisma.$transaction(
      async (tx) => {
        const review = await tx.progressReportReview.findUniqueOrThrow({
          where: { id: data.reviewId },
        });
        await lockReport(tx, review.reportId);
        const source = await reviewSource(tx, review.reportId);
        if (
          !canDispatchWeeklyReport(
            review.status,
            review.fingerprint,
            source.fingerprint,
          )
        )
          throw new Error(
            "Versi terbaru harus disetujui sebelum pengiriman dicatat.",
          );
        if (!review.decidedAt || sentAt < review.decidedAt)
          throw new Error("Waktu pengiriman harus setelah persetujuan.");
        const old = await tx.progressReportDispatch.findUnique({
          where: { reviewId: review.id },
        });
        if (old) return source.report.projectId;
        await tx.progressReportDispatch.create({
          data: {
            reviewId: review.id,
            recipient: data.recipient,
            channel: data.channel,
            sentAt,
            note: data.note,
            recordedById: actor.userId,
            recordedByName: actor.name,
          },
        });
        await tx.projectWeeklySettings.upsert({
          where: { projectId: source.report.projectId },
          create: {
            projectId: source.report.projectId,
            recipient: data.recipient,
            channel: data.channel,
          },
          update: { recipient: data.recipient, channel: data.channel },
        });
        await logActivity(tx, {
          userId: actor.userId,
          action: "CREATE",
          entityType: "REPORT_DISPATCH",
          entityId: review.id,
          description: `Konfirmasi manual: ${source.report.number} versi ${review.version} dikirim melalui ${data.channel}`,
          metadata: {
            recipient: data.recipient,
            sentAt: sentAt.toISOString(),
            method: "MANUAL_CONFIRMATION",
          },
        });
        return source.report.projectId;
      },
      { timeout: 20000 },
    );
    revalidatePath(`/projects/${result}`);
    revalidatePath("/dashboard");
    return { id: data.reviewId };
  });
}

export async function saveWeeklySettings(projectId: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    if (!["ADMIN", "PROJECT_MANAGER"].includes(actor.role))
      throw new Error("Penunjukan PIC dilakukan manager.");
    const data = z
      .object({
        ownerId: z.string().nullable(),
        vendorDueAt: z.coerce.date().nullable(),
        customerDueAt: z.coerce.date().nullable(),
      })
      .parse(input);
    await prisma.project.findUniqueOrThrow({
      where: { id: projectId, deletedAt: null },
    });
    if (data.ownerId)
      await prisma.user.findUniqueOrThrow({
        where: { id: data.ownerId, isActive: true },
      });
    const changedOwner = await prisma.$transaction(async (tx) => {
      const before = await tx.projectWeeklySettings.findUnique({
        where: { projectId },
      });
      await tx.projectWeeklySettings.upsert({
        where: { projectId },
        create: { projectId, ...data },
        update: data,
      });
      await logActivity(tx, {
        userId: actor.userId,
        action: "UPDATE",
        entityType: "PROJECT_WEEKLY",
        entityId: projectId,
        description: "Memperbarui PIC dan jadwal laporan",
        metadata: JSON.parse(JSON.stringify({ before, after: data })),
      });
      if (data.ownerId && data.ownerId !== before?.ownerId)
        await notifyUser(tx, {
          userId: data.ownerId,
          type: "WEEKLY_PIC",
          title: "Anda ditunjuk sebagai PIC laporan",
          message:
            "Periksa laporan vendor, tindak lanjut, dan target pengiriman customer.",
          link: `/projects/${projectId}?tab=progress`,
        });
      return Boolean(data.ownerId && data.ownerId !== before?.ownerId);
    });
    if (changedOwner && data.ownerId) await dispatchOutbound({ userId: data.ownerId }, {
      title: "Anda ditunjuk sebagai PIC laporan", message: "Periksa laporan vendor dan target pengiriman customer di ruang proyek.", link: `/projects/${projectId}?tab=progress`,
    });
    revalidatePath(`/projects/${projectId}`);
    return { id: projectId };
  });
}

export async function classifyProgressDocument(
  id: string,
  format: "VENDOR" | "SSO",
) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    z.enum(["VENDOR", "SSO"]).parse(format);
    const doc = await prisma.document.findUniqueOrThrow({
      where: { id, deletedAt: null },
      include: { folder: true },
    });
    if (doc.folder?.routeKey !== "PROJECT/PROGRESS_REPORT")
      throw new Error("Dokumen bukan laporan proyek.");
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: { progressFormat: format },
      });
      await logActivity(tx, {
        userId: actor.userId,
        action: "UPDATE",
        entityType: "DOCUMENT",
        entityId: id,
        description: `Format sumber ditetapkan ${format}`,
      });
    });
    revalidatePath(`/projects/${doc.folder.projectId}`);
    return { id };
  });
}

export async function updateWeeklyReportDetails(
  reportId: string,
  input: unknown,
) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const data = z
      .object({
        inspectionDate: z.coerce.date(),
        summary: z.string().trim().max(6000).nullable(),
      })
      .parse(input);
    const projectId = await prisma.$transaction(async (tx) => {
      await lockReport(tx, reportId);
      const before = await tx.progressReport.findUniqueOrThrow({
        where: { id: reportId, deletedAt: null },
      });
      await tx.progressReport.update({
        where: { id: reportId },
        data: { ...data, dateVerified: true },
      });
      await logActivity(tx, {
        userId: actor.userId,
        action: "UPDATE",
        entityType: "PROGRESS_REPORT",
        entityId: reportId,
        description: "Memeriksa tanggal dan ringkasan draf laporan",
        metadata: {
          before: {
            inspectionDate: before.inspectionDate.toISOString(),
            summary: before.summary,
          },
          after: {
            inspectionDate: data.inspectionDate.toISOString(),
            summary: data.summary,
          },
        },
      });
      return before.projectId;
    });
    revalidatePath(`/projects/${projectId}`);
    return { id: reportId };
  });
}
