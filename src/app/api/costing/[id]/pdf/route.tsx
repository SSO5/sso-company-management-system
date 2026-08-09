import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { calcCostingSummary } from "@/lib/workflows/calculations";
import { CostingPdfDocument } from "@/lib/pdf/costing-document";
import { formatRevisedNumber } from "@/lib/utils";

/** Streams the Costing sheet PDF matching SSO's real costing worksheet
 * layout exactly (verified against "COSTING JPC - GEARBOX"). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sheet = await prisma.costingSheet.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      sections: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: "singleton" } });

  const summary = calcCostingSummary(
    sheet.sections.map((s) => ({
      items: s.items.map((i) => ({
        quantity: Number(i.quantity), costUnitPrice: Number(i.costUnitPrice),
        supplierDiscountPercent: Number(i.supplierDiscountPercent), marginPercent: Number(i.marginPercent),
      })),
    })),
    { operationalCost: Number(sheet.operationalCost), ppnPercent: Number(sheet.ppnPercent), pphFinalPercent: Number(sheet.pphFinalPercent) }
  );

  try {
    const buffer = await renderToBuffer(
      <CostingPdfDocument
        companyName={settings?.companyName || "PT Sarana Sinergi Optima"}
        sheet={{ number: formatRevisedNumber(sheet.number, sheet.revision), projectTitle: sheet.projectTitle, jobNo: sheet.jobNo, costingDate: sheet.costingDate }}
        customerName={sheet.customer.companyName}
        sections={sheet.sections.map((s) => ({
          name: s.name,
          items: s.items.map((i) => ({
            name: i.name,
            quantity: Number(i.quantity),
            unit: i.unit,
            costUnitPrice: Number(i.costUnitPrice),
            marginPercent: Number(i.marginPercent),
            sellingUnitPrice: Number(i.sellingUnitPrice),
            costTotal: Number(i.costTotal),
            sellingTotalPrice: Number(i.sellingTotalPrice),
          })),
        }))}
        summary={summary}
      />
    );

    const isInlineView = new URL(req.url).searchParams.get("view") === "1";
    const displayNumber = formatRevisedNumber(sheet.number, sheet.revision);
    const safeFileName = `${displayNumber.replace(/[\\/]/g, "-")}.pdf`;

    await prisma.activityLog.create({
      data: {
        userId: session.userId, action: "DOWNLOAD", entityType: "COSTING", entityId: sheet.id,
        description: `${isInlineView ? "Viewed" : "Downloaded"} PDF for ${displayNumber}`,
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
    console.error("[costing-pdf-error]", err);
    return NextResponse.json({ error: "Unable to generate PDF" }, { status: 500 });
  }
}
