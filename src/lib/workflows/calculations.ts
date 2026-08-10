// NOTE: intentionally NOT "server-only" — these are pure functions with no
// secrets, reused client-side for live totals preview (e.g. quotation/invoice
// item editors) AND server-side as the authoritative calculation before
// persisting (spec section 47: "financial calculations must happen
// server-side"). The server-side call sites in lib/workflows/quotation.ts and
// lib/workflows/finance.ts are what's actually persisted — client-side use is
// preview-only and never trusted as-is.
import type { QuotationItemInput } from "@/lib/validation/sales";
import type { InvoiceItemInput } from "@/lib/validation/finance";

/**
 * All financial math happens server-side (spec section 47: "Financial
 * calculations must happen server-side"). The client only ever sends raw
 * quantity/price/discount/tax inputs — never a pre-computed total that could
 * be tampered with.
 */
export function calcLineTotal(item: {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}): number {
  const gross = item.quantity * item.unitPrice;
  const afterDiscount = gross - gross * ((item.discountPercent ?? 0) / 100);
  const afterTax = afterDiscount + afterDiscount * ((item.taxPercent ?? 0) / 100);
  return round2(afterTax);
}

export function calcQuotationTotals(items: QuotationItemInput[], headerDiscount: number) {
  const lineTotals = items.map((i) => calcLineTotal(i));
  const subtotal = round2(lineTotals.reduce((sum, t) => sum + t, 0));
  const discount = round2(headerDiscount ?? 0);
  const taxableBase = subtotal - discount;
  // Tax is already folded into each line's total above; header `tax` field
  // mirrors the sum of tax portions for display/reporting purposes.
  const taxPortion = round2(
    items.reduce((sum, i) => {
      const gross = i.quantity * i.unitPrice;
      const afterDiscount = gross - gross * ((i.discountPercent ?? 0) / 100);
      return sum + afterDiscount * ((i.taxPercent ?? 0) / 100);
    }, 0)
  );
  const grandTotal = round2(taxableBase);
  return { subtotal, discount, tax: taxPortion, grandTotal, lineTotals };
}

export function calcInvoiceTotals(items: InvoiceItemInput[], headerDiscount: number) {
  const lineTotals = items.map((i) =>
    calcLineTotal({ quantity: i.quantity, unitPrice: i.unitPrice, taxPercent: i.taxPercent })
  );
  const subtotal = round2(lineTotals.reduce((sum, t) => sum + t, 0));
  const discount = round2(headerDiscount ?? 0);
  const tax = round2(
    items.reduce((sum, i) => sum + i.quantity * i.unitPrice * ((i.taxPercent ?? 0) / 100), 0)
  );
  const grandTotal = round2(subtotal - discount);
  return { subtotal, discount, tax, grandTotal, lineTotals };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Vendor/procurement PO math (spec: matches a real issued PO exactly —
 * "001/PO/PRO/VII/2026"): each line is simply qty * unitPrice (no per-line
 * discount/tax, unlike Quotation items). Sub Total - Discount = Netto, then
 * TAX% is applied on Netto (not Sub Total) to get TOTAL AMOUNT.
 */
export interface VendorPoLineInput {
  quantity: number;
  unitPrice: number;
}
export function calcVendorPoLine(item: VendorPoLineInput): number {
  return round2(item.quantity * item.unitPrice);
}
export function calcVendorPoTotals(items: VendorPoLineInput[], discount: number, taxPercent: number) {
  const lineTotals = items.map((i) => calcVendorPoLine(i));
  const subtotal = round2(lineTotals.reduce((sum, t) => sum + t, 0));
  const discountAmt = round2(discount ?? 0);
  const netto = round2(subtotal - discountAmt);
  const tax = round2(netto * ((taxPercent ?? 0) / 100));
  const grandTotal = round2(netto + tax);
  return { subtotal, discount: discountAmt, netto, tax, grandTotal, lineTotals };
}

/**
 * Costing line math (spec: dynamic sections/line-items, per-line margin so
 * PICs can cross-subsidize between items). Formula verified line-by-line
 * against SSO's real "COSTING JPC - GEARBOX" reference sheet:
 *   sellingUnitPrice = costAfterSupplierDiscount / (1 - margin%),
 *   then rounded UP to the nearest Rp 1,000 (not just 2 decimals — the
 *   reference sheet's every selling price lands exactly on a thousand,
 *   e.g. 967,860/(1-30%) = 1,382,657.14 -> 1,383,000). sellingTotalPrice
 *   uses this rounded unit price, matching the reference exactly.
 * Margin is intentionally allowed to vary per line (some items carry more
 * margin to offset others priced closer to cost).
 */
export interface CostingLineInput {
  quantity: number;
  costUnitPrice: number;
  supplierDiscountPercent?: number;
  marginPercent?: number;
}
export function calcCostingLine(item: CostingLineInput) {
  const discount = item.supplierDiscountPercent ?? 0;
  const margin = item.marginPercent ?? 0;
  if (margin >= 100) {
    throw new Error("Margin percent must be less than 100.");
  }
  const costUnitAfterDiscount = round2(item.costUnitPrice * (1 - discount / 100));
  const costTotal = round2(costUnitAfterDiscount * item.quantity);
  const rawSellingUnit = costUnitAfterDiscount / (1 - margin / 100);
  const sellingUnitPrice = Math.ceil(rawSellingUnit / 1000) * 1000; // SOP: round UP to nearest Rp 1,000
  const sellingTotalPrice = round2(sellingUnitPrice * item.quantity);
  return { costUnitAfterDiscount, costTotal, sellingUnitPrice, sellingTotalPrice };
}

export interface CostingProfitabilityOpts {
  operationalCost?: number;
  ppnPercent?: number; // default 11 — charged on Total COGS (input VAT on procurement)
  pphFinalPercent?: number; // default 2 — charged on Total COGS (withholding on vendor/procurement spend)
}

/**
 * Full "Ringkasan Profitabilitas" chain from the reference sheet:
 *   Total Revenue - Total COGS = Gross Profit (-> Gross Margin %)
 *   Gross Profit - Operational - PPN - PPh Final = Net Profit (-> Net Margin %)
 * PPN and PPh Final are both a % of Total COGS, verified exactly against the
 * reference (COGS 298,229,050 x 11% = 32,805,195.50; x 2% = 5,964,581.00).
 */
export function calcCostingSummary(
  sections: { items: CostingLineInput[] }[],
  opts: CostingProfitabilityOpts = {}
) {
  let totalCost = 0;
  let totalRevenue = 0;
  const sectionTotals = sections.map((section) => {
    let sectionCost = 0;
    let sectionSelling = 0;
    for (const item of section.items) {
      const line = calcCostingLine(item);
      sectionCost += line.costTotal;
      sectionSelling += line.sellingTotalPrice;
    }
    totalCost += sectionCost;
    totalRevenue += sectionSelling;
    return { cost: round2(sectionCost), selling: round2(sectionSelling) };
  });

  totalCost = round2(totalCost);
  totalRevenue = round2(totalRevenue);
  const grossProfit = round2(totalRevenue - totalCost);
  const grossMarginPercent = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;

  const operationalCost = round2(opts.operationalCost ?? 0);
  const ppnPercent = opts.ppnPercent ?? 11;
  const pphFinalPercent = opts.pphFinalPercent ?? 2;
  const ppnAmount = round2(totalCost * (ppnPercent / 100));
  const pphFinalAmount = round2(totalCost * (pphFinalPercent / 100));
  const netProfit = round2(grossProfit - operationalCost - ppnAmount - pphFinalAmount);
  const netMarginPercent = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0;

  return {
    totalCost,
    totalSelling: totalRevenue, // kept for backward compatibility with existing UI
    totalRevenue,
    grossProfit,
    grossMarginPercent,
    totalMargin: grossMarginPercent, // alias, backward compatibility
    operationalCost,
    ppnPercent,
    ppnAmount,
    pphFinalPercent,
    pphFinalAmount,
    netProfit,
    netMarginPercent,
    sectionTotals,
  };
}

export interface ProfitabilityInput {
  revenue: number; // contract value / invoiced revenue
  cost: number; // sum of project expenses (+ optionally COGS)
}
export function calcProfitability({ revenue, cost }: ProfitabilityInput) {
  const grossProfit = round2(revenue - cost);
  const grossMargin = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;
  return { grossProfit, grossMargin };
}
