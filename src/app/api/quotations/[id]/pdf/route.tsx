import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { renderQuotationPdf, QuotationPdfNotFoundError } from "@/lib/pdf/render-quotation-pdf";

/**
 * Streams the Quotation PDF matching SSO's SOP template. ?view=1 opens
 * inline in the browser (View / Print buttons); without it, downloads.
 * ?revision=N prints a past, superseded revision instead of the live
 * record — see renderQuotationPdf for how that's resolved. Auth is
 * re-checked here — same choke-point pattern as /api/files/[id].
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const revisionParam = new URL(req.url).searchParams.get("revision");
  const revision = revisionParam !== null ? Number(revisionParam) : undefined;

  try {
    const { buffer, fileName } = await renderQuotationPdf(params.id, revision);

    const isInlineView = new URL(req.url).searchParams.get("view") === "1";

    await prisma.activityLog.create({
      data: {
        userId: session.userId, action: "DOWNLOAD", entityType: "QUOTATION", entityId: params.id,
        description: `${isInlineView ? "Viewed" : "Downloaded"} PDF for ${fileName.replace(/\.pdf$/, "")}`,
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
    if (err instanceof QuotationPdfNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("[quotation-pdf-error]", err);
    return NextResponse.json({ error: "Unable to generate PDF" }, { status: 500 });
  }
}
