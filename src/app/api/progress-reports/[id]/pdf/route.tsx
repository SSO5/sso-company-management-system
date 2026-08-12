import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { loadPdfImage } from "@/lib/pdf/branding";
import { ProgressReportPdfDocument } from "@/lib/pdf/progress-report-document";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const report = await prisma.progressReport.findUnique({
    where: { id: params.id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      preparedBy: { select: { name: true, title: true, signatureImageUrl: true } },
      project: { select: { number: true, name: true, customer: { select: { companyName: true } } } },
    },
  });
  if (!report || report.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findUnique({ where: { id: "singleton" } });

  // Photos are fetched in parallel rather than one item at a time: a report
  // with 12 checkpoints holds 24 images, and doing those sequentially against
  // remote object storage is what would make this route feel broken.
  const [logo, signature, ...photos] = await Promise.all([
    loadPdfImage(settings?.logoUrl),
    loadPdfImage(report.preparedBy?.signatureImageUrl),
    ...report.items.flatMap((i) => [loadPdfImage(i.photoBeforeKey), loadPdfImage(i.photoAfterKey)]),
  ]);

  try {
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
            notes: i.notes,
            isDone: i.isDone,
            photoBefore: photos[idx * 2] ?? null,
            photoAfter: photos[idx * 2 + 1] ?? null,
          })),
        }}
        company={{ companyName: settings?.companyName || "PT Sarana Sinergi Optima" }}
        logo={logo}
        signature={signature}
      />
    );

    const isInlineView = new URL(req.url).searchParams.get("view") === "1";
    const safeFileName = `${report.number.replace(/[\\/]/g, "-")}.pdf`;

    await prisma.activityLog.create({
      data: {
        userId: session.userId, action: "DOWNLOAD", entityType: "PROGRESS_REPORT", entityId: report.id,
        description: `${isInlineView ? "Viewed" : "Downloaded"} PDF for ${report.number}`,
      },
    });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isInlineView ? "inline" : "attachment"}; filename="${safeFileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[progress-report-pdf-error]", err);
    return NextResponse.json({ error: "Unable to generate PDF" }, { status: 500 });
  }
}
