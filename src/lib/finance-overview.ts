import {
  invoiceDueAmount,
  invoiceOutstanding,
  round2,
} from "./workflows/calculations";
export const issuedInvoice = (status: string) =>
  ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"].includes(status);
type Invoice = {
  status: string;
  grandTotal: number;
  dpPercent: number | null;
  paidAmount: number;
  withholdingTax: number;
};
export function billingTotals(invoices: Invoice[]) {
  const issued = invoices.filter((i) => issuedInvoice(i.status));
  return {
    billed: round2(issued.reduce((s, i) => s + invoiceDueAmount(i), 0)),
    cash: round2(issued.reduce((s, i) => s + i.paidAmount, 0)),
    withholding: round2(issued.reduce((s, i) => s + i.withholdingTax, 0)),
    outstanding: round2(issued.reduce((s, i) => s + invoiceOutstanding(i), 0)),
    drafts: round2(
      invoices
        .filter((i) => !issuedInvoice(i.status) && i.status !== "CANCELLED")
        .reduce((s, i) => s + invoiceDueAmount(i), 0),
    ),
  };
}
export function forecastMargin(netSales: number, totalCost: number) {
  return {
    margin: round2(netSales - totalCost),
    percent:
      netSales > 0 ? round2(((netSales - totalCost) / netSales) * 100) : null,
  };
}
export function exactPoMatch(
  reference: string | null,
  customerId: string,
  orders: { id: string; number: string; customerId: string }[],
) {
  if (!reference) return null;
  const normalized = reference.trim().toUpperCase().replace(/\s+/g, " ");
  const found = orders.filter(
    (p) =>
      p.customerId === customerId &&
      p.number.trim().toUpperCase().replace(/\s+/g, " ") === normalized,
  );
  return found.length === 1 ? found[0].id : null;
}
