import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { calcCostingSummary } from "@/lib/workflows/calculations";
import { formatDate, formatRevisedNumber } from "@/lib/utils";

/**
 * Excel version of the Costing Sheet print-out (spec: some users need to
 * hand this to someone who wants to re-check the math, tweak a number and
 * see it recalculate, or paste it into another workbook — a PDF can't do
 * that). Unlike a plain "print to Excel" that just freezes numbers, every
 * derived cell here is a REAL Excel formula (=E5*(1-F5)*C5, =SUM(...), etc.)
 * referencing the raw inputs — open it and the math is live, exactly like
 * the reference "COSTING JPC - GEARBOX" worksheet SSO already works from.
 * Only raw inputs (Qty, Unit, Cost/Unit, Disc%, Margin%, Operational Cost,
 * PPN%, PPh Final%) are static values; everything derived is a formula.
 * `result` is pre-filled with the same numbers calcCostingSummary computes
 * server-side, so the file shows correct totals immediately even before
 * Excel's own recalculation kicks in (fullCalcOnLoad forces one anyway).
 */
const IDR = "#,##0";
const PCT = "0%";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
const INPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }; // pale yellow = editable raw input, Excel-convention
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
    // Forces Excel/Google Sheets/LibreOffice to recompute every formula the
    // moment the file is opened, instead of trusting our cached `result`.
    workbook.calcProperties = { fullCalcOnLoad: true };

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
    // Columns: 1 No, 2 Item, 3 Qty, 4 Unit, 5 Cost/Unit, 6 Disc%, 7 Margin%,
    // 8 Cost Total, 9 Selling/Unit, 10 Selling Total.

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

    ws.mergeCells(r, 1, r, LAST_COL);
    ws.getCell(r, 1).value = "Sel kuning = input mentah (boleh diubah). Sel putih = rumus, otomatis hitung ulang.";
    ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    r += 2;

    // ---- Section tables --------------------------------------------------
    const columnHeaders = ["No", "Item", "Qty", "Unit", "Harga Beli/Unit", "Disc %", "Margin %", "Total Beli (COGS)", "Harga Jual/Unit", "Total Jual"];
    const sectionSubtotalRows: number[] = []; // row index of each section's subtotal row

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

      const itemStartRow = r;
      section.items.forEach((item, idx) => {
        const row = ws.getRow(r);
        row.getCell(1).value = idx + 1;
        row.getCell(2).value = item.name;
        row.getCell(3).value = Number(item.quantity); // input
        row.getCell(4).value = item.unit; // input
        row.getCell(5).value = Number(item.costUnitPrice); // input
        row.getCell(6).value = Number(item.supplierDiscountPercent) / 100; // input
        row.getCell(7).value = Number(item.marginPercent) / 100; // input
        [3, 5, 6, 7].forEach((c) => (row.getCell(c).fill = INPUT_FILL));

        // Derived — live formulas, mirroring calcCostingLine() exactly:
        //   costUnitAfterDiscount = costUnitPrice * (1 - disc%)
        //   costTotal             = costUnitAfterDiscount * qty
        //   sellingUnitPrice      = CEILING(costUnitAfterDiscount / (1 - margin%), 1000)
        //   sellingTotalPrice     = sellingUnitPrice * qty
        row.getCell(8).value = { formula: `E${r}*(1-F${r})*C${r}`, result: Number(item.costTotal) };
        row.getCell(9).value = { formula: `CEILING(E${r}*(1-F${r})/(1-G${r}),1000)`, result: Number(item.sellingUnitPrice) };
        row.getCell(10).value = { formula: `I${r}*C${r}`, result: Number(item.sellingTotalPrice) };

        [5, 8, 9, 10].forEach((c) => (row.getCell(c).numFmt = IDR));
        [6, 7].forEach((c) => (row.getCell(c).numFmt = PCT));
        for (let c = 1; c <= LAST_COL; c++) row.getCell(c).border = THIN_BORDER;
        r += 1;
      });
      const itemEndRow = r - 1;

      const subtotalRow = ws.getRow(r);
      ws.mergeCells(r, 1, r, 7);
      subtotalRow.getCell(1).value = `Subtotal ${section.name}`;
      subtotalRow.getCell(1).font = { bold: true };
      subtotalRow.getCell(8).value = { formula: `SUM(H${itemStartRow}:H${itemEndRow})` };
      subtotalRow.getCell(10).value = { formula: `SUM(J${itemStartRow}:J${itemEndRow})` };
      [8, 10].forEach((c) => {
        subtotalRow.getCell(c).numFmt = IDR;
        subtotalRow.getCell(c).font = { bold: true };
      });
      for (let c = 1; c <= LAST_COL; c++) subtotalRow.getCell(c).border = THIN_BORDER;
      sectionSubtotalRows.push(r);
      r += 2; // blank spacer between sections
    }

    // ---- Profitability summary ------------------------------------------
    ws.mergeCells(r, 1, r, LAST_COL);
    ws.getCell(r, 1).value = "RINGKASAN PROFITABILITAS";
    ws.getCell(r, 1).fill = HEADER_FILL;
    ws.getCell(r, 1).font = WHITE_BOLD;
    r += 1;

    const sumFormula = (col: "H" | "J") => sectionSubtotalRows.map((row) => `${col}${row}`).join("+") || "0";

    const totalRevenueRow = r;
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = "Total Pendapatan (Total Revenue)";
    ws.getCell(r, 8).value = { formula: sumFormula("J"), result: summary.totalRevenue };
    ws.getCell(r, 8).numFmt = IDR;
    r += 1;

    const totalCostRow = r;
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = "Total Harga Pokok Penjualan (Total COGS)";
    ws.getCell(r, 8).value = { formula: sumFormula("H"), result: summary.totalCost };
    ws.getCell(r, 8).numFmt = IDR;
    r += 1;

    const grossProfitRow = r;
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = "Total Keuntungan Kotor (Gross Profit)";
    ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 8).value = { formula: `H${totalRevenueRow}-H${totalCostRow}`, result: summary.grossProfit };
    ws.getCell(r, 8).numFmt = IDR;
    ws.getCell(r, 8).font = { bold: true };
    r += 1;

    const operationalCostRow = r;
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = "Biaya Operasional";
    ws.getCell(r, 8).value = summary.operationalCost; // raw input — editable
    ws.getCell(r, 8).numFmt = IDR;
    ws.getCell(r, 8).fill = INPUT_FILL;
    r += 1;

    const ppnRow = r;
    ws.mergeCells(r, 1, r, 6);
    ws.getCell(r, 1).value = "PPN (dari COGS)";
    ws.getCell(r, 7).value = summary.ppnPercent / 100; // rate — editable
    ws.getCell(r, 7).numFmt = PCT;
    ws.getCell(r, 7).fill = INPUT_FILL;
    ws.getCell(r, 8).value = { formula: `H${totalCostRow}*G${ppnRow}`, result: summary.ppnAmount };
    ws.getCell(r, 8).numFmt = IDR;
    r += 1;

    const pphRow = r;
    ws.mergeCells(r, 1, r, 6);
    ws.getCell(r, 1).value = "PPh Final (dari COGS)";
    ws.getCell(r, 7).value = summary.pphFinalPercent / 100; // rate — editable
    ws.getCell(r, 7).numFmt = PCT;
    ws.getCell(r, 7).fill = INPUT_FILL;
    ws.getCell(r, 8).value = { formula: `H${totalCostRow}*G${pphRow}`, result: summary.pphFinalAmount };
    ws.getCell(r, 8).numFmt = IDR;
    r += 1;

    const netProfitRow = r;
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = "NET PROFIT";
    ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 8).value = {
      formula: `H${grossProfitRow}-H${operationalCostRow}-H${ppnRow}-H${pphRow}`,
      result: summary.netProfit,
    };
    ws.getCell(r, 8).numFmt = IDR;
    ws.getCell(r, 8).font = { bold: true };
    r += 1;

    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = "Gross Margin % (Gross Profit / Revenue)";
    ws.getCell(r, 1).font = { italic: true, color: { argb: "FF64748B" } };
    ws.getCell(r, 8).value = {
      formula: `IF(H${totalRevenueRow}=0,0,H${grossProfitRow}/H${totalRevenueRow})`,
      result: summary.grossMarginPercent / 100,
    };
    ws.getCell(r, 8).numFmt = "0.0%";
    ws.getCell(r, 8).font = { italic: true, color: { argb: "FF64748B" } };
    r += 1;

    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = "Net Margin % (Net Profit / Revenue)";
    ws.getCell(r, 1).font = { italic: true, color: { argb: "FF64748B" } };
    ws.getCell(r, 8).value = {
      formula: `IF(H${totalRevenueRow}=0,0,H${netProfitRow}/H${totalRevenueRow})`,
      result: summary.netMarginPercent / 100,
    };
    ws.getCell(r, 8).numFmt = "0.0%";
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
