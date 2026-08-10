import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { calcCostingSummary } from "@/lib/workflows/calculations";
import { formatDate, formatRevisedNumber } from "@/lib/utils";

/**
 * Excel version of the Costing Sheet print-out (spec: some users need to
 * hand this to someone who wants to re-check the math, tweak a number, or
 * paste it into another workbook — a PDF can't do that, a spreadsheet can).
 * Mirrors the PDF's numbers exactly (same calcCostingSummary call, same
 * source data) so the two formats never disagree.
 */
const IDR = "#,##0";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
const WHITE_BOLD: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

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

  const displayNumber = formatRevisedNumber(sheet.number, sheet.revision);

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = settings?.companyName || "PT Sarana Sinergi Optima";
    workbook.created = new Date();

    const ws = workbook.addWorksheet("Costing Sheet", {
      views: [{ state: "frozen", ySplit: 0 }],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    ws.columns = [
      { key: "no", width: 5 },
      { key: "item", width: 34 },
      { key: "qty", width: 8 },
      { key: "unit", width: 8 },
      { key: "costUnit", width: 15 },
      { key: "disc", width: 8 },
      { key: "margin", width: 8 },
      { key: "costTotal", width: 16 },
      { key: "sellUnit", width: 15 },
      { key: "sellTotal", width: 16 },
    ];
    const LAST_COL = 10;

    // ---- Letterhead ----------------------------------------------------
    ws.mergeCells(1, 1, 1, LAST_COL);
    ws.getCell(1, 1).value = (settings?.companyName || "PT Sarana Sinergi Optima").toUpperCase();
    ws.getCell(1, 1).font = { bold: true, size: 14 };

    ws.mergeCells(2, 1, 2, LAST_COL);
    ws.getCell(2, 1).value = "COSTING SHEET";
    ws.getCell(2, 1).font = { bold: true, size: 11, color: { argb: "FF64748B" } };

    const infoRows: [string, string][] = [
      ["No. Costing", displayNumber],
      ["Proyek", sheet.projectTitle],
      ["Job No.", sheet.jobNo || "-"],
      ["Tanggal", formatDate(sheet.costingDate)],
      ["Customer", sheet.customer.companyName],
    ];
    let r = 4;
    for (const [label, value] of infoRows) {
      ws.getCell(r, 1).value = label;
      ws.getCell(r, 1).font = { bold: true, color: { argb: "FF64748B" } };
      ws.mergeCells(r, 2, r, 4);
      ws.getCell(r, 2).value = value;
      r += 1;
    }
    r += 1; // blank spacer row

    // ---- Section tables --------------------------------------------------
    const headerRowIdx0 = r;
    const columnHeaders = ["No", "Item", "Qty", "Unit", "Harga Beli/Unit", "Disc %", "Margin %", "Total Beli (COGS)", "Harga Jual/Unit", "Total Jual"];

    for (const section of sheet.sections) {
      ws.mergeCells(r, 1, r, LAST_COL);
      const sectionCell = ws.getCell(r, 1);
      sectionCell.value = `${section.code} — ${section.name}`;
      sectionCell.fill = SECTION_FILL;
      sectionCell.font = { bold: true };
      r += 1;

      const headerRow = ws.getRow(r);
      columnHeaders.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.fill = HEADER_FILL;
        cell.font = WHITE_BOLD;
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = THIN_BORDER;
      });
      r += 1;

      let sectionCost = 0;
      let sectionSelling = 0;
      section.items.forEach((item, idx) => {
        const row = ws.getRow(r);
        row.getCell(1).value = idx + 1;
        row.getCell(2).value = item.name;
        row.getCell(3).value = Number(item.quantity);
        row.getCell(4).value = item.unit;
        row.getCell(5).value = Number(item.costUnitPrice);
        row.getCell(6).value = Number(item.supplierDiscountPercent) / 100;
        row.getCell(7).value = Number(item.marginPercent) / 100;
        row.getCell(8).value = Number(item.costTotal);
        row.getCell(9).value = Number(item.sellingUnitPrice);
        row.getCell(10).value = Number(item.sellingTotalPrice);
        [5, 8, 9, 10].forEach((c) => (row.getCell(c).numFmt = IDR));
        [6, 7].forEach((c) => (row.getCell(c).numFmt = "0%"));
        for (let c = 1; c <= LAST_COL; c++) row.getCell(c).border = THIN_BORDER;
        sectionCost += Number(item.costTotal);
        sectionSelling += Number(item.sellingTotalPrice);
        r += 1;
      });

      const subtotalRow = ws.getRow(r);
      ws.mergeCells(r, 1, r, 7);
      subtotalRow.getCell(1).value = `Subtotal ${section.name}`;
      subtotalRow.getCell(1).font = { bold: true };
      subtotalRow.getCell(8).value = sectionCost;
      subtotalRow.getCell(10).value = sectionSelling;
      [8, 10].forEach((c) => {
        subtotalRow.getCell(c).numFmt = IDR;
        subtotalRow.getCell(c).font = { bold: true };
      });
      for (let c = 1; c <= LAST_COL; c++) subtotalRow.getCell(c).border = THIN_BORDER;
      r += 2; // blank spacer between sections
    }
    void headerRowIdx0;

    // ---- Profitability summary ------------------------------------------
    ws.mergeCells(r, 1, r, LAST_COL);
    ws.getCell(r, 1).value = "RINGKASAN PROFITABILITAS";
    ws.getCell(r, 1).fill = HEADER_FILL;
    ws.getCell(r, 1).font = WHITE_BOLD;
    r += 1;

    const summaryRows: [string, number, boolean?][] = [
      ["Total Pendapatan (Total Revenue)", summary.totalRevenue],
      ["Total Harga Pokok Penjualan (Total COGS)", summary.totalCost],
      ["Total Keuntungan Kotor (Gross Profit)", summary.grossProfit, true],
      ["Biaya Operasional", summary.operationalCost],
      [`PPN (${summary.ppnPercent}% dari COGS)`, summary.ppnAmount],
      [`PPh Final (${summary.pphFinalPercent}% dari COGS)`, summary.pphFinalAmount],
      ["NET PROFIT", summary.netProfit, true],
    ];
    for (const [label, value, bold] of summaryRows) {
      ws.mergeCells(r, 1, r, 7);
      ws.getCell(r, 1).value = label;
      if (bold) ws.getCell(r, 1).font = { bold: true };
      ws.getCell(r, 8).value = value;
      ws.getCell(r, 8).numFmt = IDR;
      if (bold) ws.getCell(r, 8).font = { bold: true };
      r += 1;
    }
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = "Gross Margin % / Net Margin %";
    ws.getCell(r, 8).value = `${summary.grossMarginPercent.toFixed(1)}% / ${summary.netMarginPercent.toFixed(1)}%`;
    ws.getCell(r, 1).font = { italic: true, color: { argb: "FF64748B" } };
    ws.getCell(r, 8).font = { italic: true, color: { argb: "FF64748B" } };

    const buffer = await workbook.xlsx.writeBuffer();

    const safeFileName = `${displayNumber.replace(/[\\/]/g, "-")}.xlsx`;
    await prisma.activityLog.create({
      data: {
        userId: session.userId, action: "DOWNLOAD", entityType: "COSTING", entityId: sheet.id,
        description: `Downloaded Excel for ${displayNumber}`,
      },
    });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[costing-excel-error]", err);
    return NextResponse.json({ error: "Unable to generate Excel file" }, { status: 500 });
  }
}
