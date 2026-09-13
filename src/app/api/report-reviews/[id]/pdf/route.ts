import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "view");
    const review = await prisma.progressReportReview.findUnique({
      where: { id: params.id },
    });
    if (!review)
      return new NextResponse("Laporan tidak ditemukan", { status: 404 });
    if (
      review.status !== "APPROVED" &&
      actor.userId !== review.approverId &&
      actor.userId !== review.requestedById
    )
      return new NextResponse("Laporan masih dalam pemeriksaan direktur", {
        status: 403,
      });
    const buffer = await getStorageDriver().read(review.pdfKey);
    if (createHash("sha256").update(buffer).digest("hex") !== review.pdfHash)
      return new NextResponse("Salinan laporan gagal diverifikasi", {
        status: 409,
      });
    const mode = new URL(request.url).searchParams.has("download")
      ? "attachment"
      : "inline";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${mode}; filename="SSO-laporan-v${review.version}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Laporan tidak dapat dibuka", { status: 403 });
  }
}
