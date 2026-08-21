import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { calcCostingSummary } from "@/lib/workflows/calculations";
import { CostingPdfDocument } from "@/lib/pdf/costing-document";
import { formatRevisedNumber } from "@/lib/utils";
import type { CostingSheetSnapshot } from "@/lib/workflows/revision-history";

/** Streams the Costing sheet PDF matching SSO's real costing worksheet
 * layout exactly (verified against "COSTING JPC - GEARBOX"). ?revision=N
 * prints a past, superseded revision from CostingSheetRevisionHistory
 * instead of the live record — the customer name is still read live (it
 * doesn't change revision to revision), everything else (sections/items,
 * operational cost, PPN/PPh, project title, date) comes from that
 * revision's frozen snapshot. */
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

  const revisionParam = new URL(req.url).searchParams.get("revision");
  const requestedRevision = revisionParam !== null ? Number(revisionParam) : sheet.revision;
  if (revisionParam !== null && (!Number.isInteger(requestedRevision) || requestedRevision < 0)) {
    return NextResponse.json({ error: "Invalid revision" }, { status: 400 });
  }

  let sheetForPdf = { number: formatRevisedNumber(sheet.number, sheet.revision), projectTitle: sheet.projectTitle, jobNo: sheet.jobNo, costingDate: sheet.costingDate };
  let sectionsForPdf = sheet.sections.map((s) => ({
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
  }));
  let summaryInputs = {
    sections: sheet.sections.map((s) => ({
      items: s.items.map((i) => ({
        quantity: Number(i.quantity), costUnitPrice: Number(i.costUnitPrice),
        supplierDiscountPercent: Number(i.supplierDiscountPercent), marginPercent: Number(i.marginPercent),
      })),
    })),
    operationalCost: Number(sheet.operationalCost), ppnPercent: Number(sheet.ppnPercent), pphFinalPercent: Number(sheet.pphFinalPercent),
  };

  if (requestedRevision !== sheet.revision) {
    const historyRow = await prisma.costingSheetRevisionHistory.findUnique({
      where: { costingSheetId_revision: { costingSheetId: sheet.id, revision: requestedRevision } },
    });
    if (!historyRow) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }
    const snap = historyRow.snapshot as unknown as CostingSheetSnapshot;
    sheetForPdf = {
      number: formatRevisedNumber(sheet.number, requestedRevision),
      projectTitle: snap.projectTitle,
      jobNo: snap.jobNo,
      costingDate: new Date(snap.costingDate),
    };
    sectionsForPdf = snap.sections.map((s) => ({
      name: s.name,
      items: s.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        costUnitPrice: i.costUnitPrice,
        marginPercent: i.marginPercent,
        sellingUnitPrice: i.sellingUnitPrice,
        costTotal: i.costTotal,
        sellingTotalPrice: i.sellingTotalPrice,
      })),
    }));
    summaryInputs = {
      sections: snap.sections.map((s) => ({
        items: s.items.map((i) => ({
          quantity: i.quantity, costUnitPrice: i.costUnitPrice,
          supplierDiscountPercent: i.supplierDiscountPercent, marginPercent: i.marginPercent,
        })),
      })),
      operationalCost: snap.operationalCost, ppnPercent: snap.ppnPercent, pphFinalPercent: snap.pphFinalPercent,
    };
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: "singleton" } });

  const summary = calcCostingSummary(summaryInputs.sections, {
    operationalCost: summaryInputs.operationalCost, ppnPercent: summaryInputs.ppnPercent, pphFinalPercent: summaryInputs.pphFinalPercent,
  });

  try {
    const buffer = await renderToBuffer(
      <CostingPdfDocument
        companyName={settings?.companyName || "PT Sarana Sinergi Optima"}
        sheet={sheetForPdf}
        customerName={sheet.customer.companyName}
        sections={sectionsForPdf}
        summary={summary}
      />
    );

    const isInlineView = new URL(req.url).searchParams.get("view") === "1";
    const displayNumber = sheetForPdf.number;
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
