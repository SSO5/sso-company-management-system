import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { loadPdfImage } from "@/lib/pdf/branding";
import { ProgressReportPdfDocument } from "@/lib/pdf/progress-report-document";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getStorageDriver } from "@/lib/storage";

export class ProgressReportPdfNotFoundError extends Error {}

/**
 * Shared by app/api/progress-reports/[id]/pdf/route.tsx (browser view/
 * download, auth via session cookie) and the Telegram automation (auth via
 * resolved chat actor, no cookie) — both need the exact same PDF bytes, same
 * reasoning as render-quotation-pdf.tsx. Callers own their own auth check
 * and activity logging; this only renders.
 */
export async function renderProgressReportPdf(reportId: string, options?: { reviewCopy?: boolean }): Promise<{ buffer: Buffer; fileName: string }> {
  const report = await prisma.progressReport.findUnique({
    where: { id: reportId },
    include: {
      sourceDocument: true,
      items: { orderBy: { sortOrder: "asc" } },
      preparedBy: { select: { name: true, title: true, signatureImageUrl: true } },
      project: { select: { number: true, name: true, customer: { select: { companyName: true } } } },
    },
  });
  if (!report || report.deletedAt) throw new ProgressReportPdfNotFoundError("Progress report not found.");

  const settings = await prisma.companySettings.findUnique({ where: { id: "singleton" } });

  // Photos are fetched in parallel rather than one item at a time: a report
  // with 12 checkpoints holds 24 images, and doing those sequentially against
  // remote object storage is what would make this route feel broken.
  const sourceEvidence = report.aiGenerated && report.sourceDocument && !report.sourceDocument.deletedAt;
  const [logo, signature, ...photos] = await Promise.all([
    loadPdfImage(settings?.logoUrl),
    loadPdfImage(report.preparedBy?.signatureImageUrl),
    ...report.items.flatMap((i) => sourceEvidence ? [Promise.resolve(null), Promise.resolve(null)] : [loadPdfImage(i.photoBeforeKey), loadPdfImage(i.photoAfterKey)]),
  ]);

  let buffer = await renderToBuffer(
    <ProgressReportPdfDocument
      report={{
        draft: !options?.reviewCopy,
        number: report.number,
        inspectionDate: report.inspectionDate,
        location: report.location,
        summary: report.summary,
        overallPercent: report.overallPercent,
        preparedByName: report.preparedBy?.name ?? "Engineering Team",
        preparedByTitle: report.preparedBy?.title ?? null,
        projectNumber: report.project.number,
        projectName: report.project.name,
        customerName: report.project.customer.companyName,
        items: report.items.map((i, idx) => ({
          sectionName: i.sectionName,
          partName: i.partName,
          quantity: i.quantity,
          notes: i.notes,
          isDone: i.isDone,
          photoBefore: photos[idx * 2] ?? null,
          photoAfter: photos[idx * 2 + 1] ?? null,
        })),
      }}
      company={{
        companyName: settings?.companyName || "PT Sarana Sinergi Optima",
        address: settings?.address ?? null,
        addressLine2: settings?.addressLine2 ?? null,
        city: settings?.city ?? null,
        province: settings?.province ?? null,
        phone: settings?.phone ?? null,
      }}
      logo={logo}
      signature={signature}
    />
  );

  if (sourceEvidence && report.sourceDocument) {
    const original = await getStorageDriver().read(report.sourceDocument.storagePath);
    const output = await PDFDocument.load(buffer);
    const font = await output.embedFont(StandardFonts.Helvetica);
    if (report.sourceDocument.mimeType === "application/pdf") {
      const source = await PDFDocument.load(original);
      const pages = await output.copyPages(source, source.getPageIndices());
      // Insert a distinct divider; original evidence pages are copied intact.
      const divider = output.addPage([595.28, 841.89]);
      divider.drawText("SSO - LAMPIRAN BUKTI SUMBER", { x: 36, y: 780, size: 16, font, color: rgb(.12, .22, .39) });
      divider.drawText("Foto dan tabel sumber dipertahankan pada halaman berikut.", { x: 36, y: 750, size: 10, font });
      divider.drawText("Ringkasan SSO di depan harus diperiksa bersama bukti ini.", { x: 36, y: 732, size: 10, font });
      for (const page of pages) output.addPage(page);
    } else if (["image/jpeg", "image/png", "image/webp"].includes(report.sourceDocument.mimeType)) {
      const sharp = (await import("sharp")).default;
      const png = await sharp(original).rotate().png().toBuffer();
      const embedded = await output.embedPng(png), page = output.addPage([595.28, 841.89]);
      page.drawText("SSO - BUKTI SUMBER", { x: 30, y: 805, size: 12, font });
      const scale = Math.min(535 / embedded.width, 740 / embedded.height);
      page.drawImage(embedded, { x: (595.28 - embedded.width * scale) / 2, y: 35, width: embedded.width * scale, height: embedded.height * scale });
    }
    buffer = Buffer.from(await output.save());
  }

  const fileName = `${report.number.replace(/[\\/]/g, "-")}.pdf`;
  return { buffer, fileName };
}
