import { isIssuedInvoice } from "./workspace";
import { invoiceDueAmount, invoiceOutstanding } from "./workflows/calculations";

export function summarizeIssuedInvoices(invoices: (Parameters<typeof invoiceOutstanding>[0] & { status: string })[]) {
  const issued = invoices.filter(i => isIssuedInvoice(i.status));
  return {
    count: issued.length,
    totalInvoiced: issued.reduce((sum, i) => sum + invoiceDueAmount(i), 0),
    totalPaid: issued.reduce((sum, i) => sum + Number(i.paidAmount || 0), 0),
    totalWithheld: issued.reduce((sum, i) => sum + Number(i.withholdingTax || 0), 0),
    outstanding: issued.reduce((sum, i) => sum + Math.max(0, invoiceOutstanding(i)), 0),
  };
}
