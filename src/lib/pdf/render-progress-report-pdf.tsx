import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { loadPdfImage } from "@/lib/pdf/branding";
import { ProgressReportPdfDocument } from "@/lib/pdf/progress-report-document";

export class ProgressReportPdfNotFoundError extends Error {}

/**
 * Shared by app/api/progress-reports/[id]/pdf/route.tsx (browser view/
 * download, auth via session cookie) and the Telegram automation (auth via
 * resolved chat actor, no cookie) — both need the exact same PDF bytes, same
 * reasoning as render-quotation-pdf.tsx. Callers own their own auth check
 * and activity logging; this only renders.
 */
export async function renderProgressReportPdf(reportId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const report = await prisma.progressReport.findUnique({
    where: { id: reportId },
    include: {
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
  const [logo, signature, ...photos] = await Promise.all([
    loadPdfImage(settings?.logoUrl),
    loadPdfImage(report.preparedBy?.signatureImageUrl),
    ...report.items.flatMap((i) => [loadPdfImage(i.photoBeforeKey), loadPdfImage(i.photoAfterKey)]),
  ]);

  const buffer = await renderToBuffer(
    <ProgressReportPdfDocument
      report={{
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

  const fileName = `${report.number.replace(/[\\/]/g, "-")}.pdf`;
  return { buffer, fileName };
}
