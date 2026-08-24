import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { renderProgressReportPdf, ProgressReportPdfNotFoundError } from "@/lib/pdf/render-progress-report-pdf";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { buffer, fileName } = await renderProgressReportPdf(params.id);

    const isInlineView = new URL(req.url).searchParams.get("view") === "1";

    await prisma.activityLog.create({
      data: {
        userId: session.userId, action: "DOWNLOAD", entityType: "PROGRESS_REPORT", entityId: params.id,
        description: `${isInlineView ? "Viewed" : "Downloaded"} PDF for ${fileName}`,
      },
    });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isInlineView ? "inline" : "attachment"}; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ProgressReportPdfNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("[progress-report-pdf-error]", err);
    return NextResponse.json({ error: "Unable to generate PDF" }, { status: 500 });
  }
}
