import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { formatMoneyForPdf } from "@/lib/pdf/format";
import type { PdfImageSrc } from "@/lib/pdf/branding";

/**
 * Invoice PDF matching a real issued invoice ("001/INV/FIN/VIII/2026")
 * field-for-field: the info block (No/Date/Due Date/Currency/Customer PO/PO
 * Date/Delivery Date/Sales/Job No), a "Bill To" box, a grouped item table
 * (priced lines + unpriced scope-description bullets under a bold section
 * heading), a free-form NOTE block, a bank "PAYMENT INSTRUCTIONS" box,
 * Subtotal/Discount/DPP/VAT/TOTAL AMOUNT (+ optional "TOTAL AMOUNT DUE (DP
 * X% inc. VAT)" for down-payment invoices), fixed Terms & Conditions, and
 * the company stamp.
 */
const NAVY = "#1F3864";
const BORDER = "#CBD5E1";
const GRAY = "#6B7280";
const DARK = "#111827";
const LIGHT_BG = "#F3F4F6";

const DEFAULT_INVOICE_TERMS = [
  "Payment is due within 14 days from the date of this invoice.",
  "Please include the invoice number in your payment reference.",
  "All bank charges are to be borne by the remitter.",
];

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica", color: DARK },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  companyLine: { fontSize: 7.5, color: GRAY, marginTop: 1.5, maxWidth: 260 },
  docTitle: { fontSize: 26, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },

  headerRule: { borderTopWidth: 2, borderTopColor: NAVY, marginTop: 10, marginBottom: 12 },

  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaLeft: { width: "52%" },
  metaLine: { fontSize: 8, marginBottom: 2.5, flexDirection: "row" },
  metaLabel: { width: 78, color: GRAY },
  metaValue: { flex: 1 },

  billBox: { width: "44%", borderWidth: 0.75, borderColor: BORDER },
  billHeader: { backgroundColor: NAVY, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8, padding: 5 },
  billBody: { padding: 8 },
  billName: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginBottom: 3 },
  billLine: { fontSize: 8, color: "#374151", marginBottom: 1.5, lineHeight: 1.3 },

  table: { marginTop: 16 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY },
  tableHeaderCell: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7.5, padding: 5 },
  groupRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER, backgroundColor: "#EEF2F7" },
  groupCell: { fontFamily: "Helvetica-Bold", fontSize: 8.5, padding: 5 },
  itemRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  itemCell: { fontSize: 8, padding: 5, color: "#1F2937" },
  noteCell: { fontSize: 8, padding: 5, color: "#4B5563", fontStyle: "italic" },

  colDesc: { width: "52%" },
  colQty: { width: "12%", textAlign: "right" },
  colPrice: { width: "18%", textAlign: "right" },
  colTotal: { width: "18%", textAlign: "right" },

  notesBox: { backgroundColor: LIGHT_BG, padding: 8, marginTop: 14, borderLeftWidth: 2.5, borderLeftColor: NAVY },
  notesTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.5, marginBottom: 3 },
  notesLine: { fontSize: 8, color: "#374151", lineHeight: 1.4, marginBottom: 1 },

  bottomRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  paymentBox: { width: "48%", borderWidth: 0.75, borderColor: BORDER },
  paymentHeader: { backgroundColor: NAVY, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8, padding: 5 },
  paymentBody: { padding: 8 },
  paymentLine: { fontSize: 8, marginBottom: 2, flexDirection: "row" },
  paymentLabel: { width: 68, color: GRAY },
  paymentValue: { flex: 1, fontFamily: "Helvetica-Bold" },

  totalsBlock: { width: "48%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 4 },
  totalLabel: { fontSize: 8.5, color: "#374151" },
  totalValue: { fontSize: 8.5 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: NAVY, padding: 6, marginTop: 3 },
  grandLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },
  grandValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },
  dueRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#FEF3C7", padding: 6, marginTop: 3 },
  dueLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#92400E" },
  dueValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#92400E" },

  termsTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 3 },
  termsLine: { fontSize: 7.5, color: GRAY, lineHeight: 1.4 },

  stampWrap: { alignItems: "flex-end", marginTop: 14 },
  stampImg: { width: 76, height: 76, opacity: 0.9, objectFit: "contain" },
});

interface CompanyInfo {
  companyName: string;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
}

interface InvoicePdfProps {
  invoice: {
    number: string;
    invoiceDate: Date;
    dueDate: Date;
    customerPO: string | null;
    poDate: Date | null;
    deliveryDate: Date | null;
    jobNo: string | null;
    salesPicName: string | null;
    items: { groupLabel: string | null; description: string; quantity: number; unit: string; unitPrice: number; total: number; isNote: boolean }[];
    subtotal: number;
    discount: number;
    tax: number;
    grandTotal: number;
    dpPercent: number | null;
    notes: string | null;
  };
  customer: { companyName: string; address: string | null; phone: string | null };
  contactName: string | null;
  company: CompanyInfo;
  bank: { bankName: string | null; bankBranch: string | null; bankAccountName: string | null; bankAccountNumber: string | null };
  stamp: PdfImageSrc | null;
}

function fmt(n: number): string {
  return formatMoneyForPdf(n).replace("Rp ", "").replace(",00", "");
}
function dateStr(d: Date | null): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function InvoicePdfDocument({ invoice, customer, contactName, company, bank, stamp }: InvoicePdfProps) {
  const dpp = invoice.subtotal - invoice.discount;
  const hasBank = bank.bankName || bank.bankAccountNumber;
  const dueAmount = invoice.dpPercent ? invoice.grandTotal * (Number(invoice.dpPercent) / 100) : null;

  let lastGroup: string | null = "__none__";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{company.companyName.toUpperCase()}</Text>
            <Text style={styles.companyLine}>
              {[company.address, company.city && company.province ? `${company.city}, ${company.province}` : company.city].filter(Boolean).join(", ")}
            </Text>
            {company.phone ? <Text style={styles.companyLine}>{company.phone}</Text> : null}
          </View>
          <Text style={styles.docTitle}>INVOICE</Text>
        </View>
        <View style={styles.headerRule} />

        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Invoice No.</Text><Text style={styles.metaValue}>: {invoice.number}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Date</Text><Text style={styles.metaValue}>: {dateStr(invoice.invoiceDate)}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Due Date</Text><Text style={styles.metaValue}>: {dateStr(invoice.dueDate)}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Currency</Text><Text style={styles.metaValue}>: IDR</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Customer PO</Text><Text style={styles.metaValue}>: {invoice.customerPO || "-"}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>PO Date</Text><Text style={styles.metaValue}>: {dateStr(invoice.poDate)}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Delivery Date</Text><Text style={styles.metaValue}>: {dateStr(invoice.deliveryDate)}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Sales</Text><Text style={styles.metaValue}>: {invoice.salesPicName || "-"}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Job No.</Text><Text style={styles.metaValue}>: {invoice.jobNo || "-"}</Text></View>
          </View>

          <View style={styles.billBox}>
            <Text style={styles.billHeader}>Bill To :</Text>
            <View style={styles.billBody}>
              <Text style={styles.billName}>{customer.companyName}</Text>
              {customer.address ? <Text style={styles.billLine}>{customer.address}</Text> : null}
              {customer.phone ? <Text style={styles.billLine}>Phone: {customer.phone}</Text> : null}
              {contactName ? <Text style={styles.billLine}>Attn  : {contactName}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Unit Price (IDR)</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total Price (IDR)</Text>
          </View>
          {invoice.items.map((item, idx) => {
            const isNewGroup = item.groupLabel && item.groupLabel !== lastGroup;
            if (isNewGroup) lastGroup = item.groupLabel;
            return (
              <View key={idx}>
                {isNewGroup && (
                  <View style={styles.groupRow} wrap={false}>
                    <Text style={[styles.groupCell, styles.colDesc]}>{item.groupLabel}</Text>
                    <Text style={[styles.groupCell, styles.colQty]}></Text>
                    <Text style={[styles.groupCell, styles.colPrice]}></Text>
                    <Text style={[styles.groupCell, styles.colTotal]}></Text>
                  </View>
                )}
                {item.isNote ? (
                  <View style={styles.itemRow} wrap={false}>
                    <Text style={[styles.noteCell, styles.colDesc, { paddingLeft: item.groupLabel ? 14 : 5 }]}>{item.description}</Text>
                    <Text style={[styles.itemCell, styles.colQty]}></Text>
                    <Text style={[styles.itemCell, styles.colPrice]}></Text>
                    <Text style={[styles.itemCell, styles.colTotal]}></Text>
                  </View>
                ) : (
                  <View style={styles.itemRow} wrap={false}>
                    <Text style={[styles.itemCell, styles.colDesc, { paddingLeft: item.groupLabel ? 14 : 5 }]}>{item.description}</Text>
                    <Text style={[styles.itemCell, styles.colQty]}>{item.quantity} {item.unit}</Text>
                    <Text style={[styles.itemCell, styles.colPrice]}>{fmt(item.unitPrice)}</Text>
                    <Text style={[styles.itemCell, styles.colTotal]}>{fmt(item.total)}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {invoice.notes && (
          <View style={styles.notesBox} wrap={false}>
            <Text style={styles.notesTitle}>NOTE :</Text>
            {invoice.notes.split("\n").filter(Boolean).map((line, i) => (
              <Text key={i} style={styles.notesLine}>{line}</Text>
            ))}
          </View>
        )}

        <View style={styles.bottomRow} wrap={false}>
          {hasBank ? (
            <View style={styles.paymentBox}>
              <Text style={styles.paymentHeader}>PAYMENT INSTRUCTIONS</Text>
              <View style={styles.paymentBody}>
                <Text style={[styles.notesTitle, { marginBottom: 4 }]}>Bank Transfer Info:</Text>
                <View style={styles.paymentLine}><Text style={styles.paymentLabel}>Bank Name</Text><Text style={styles.paymentValue}>: {bank.bankName || "-"}</Text></View>
                <View style={styles.paymentLine}><Text style={styles.paymentLabel}>Branch</Text><Text style={styles.paymentValue}>: {bank.bankBranch || "-"}</Text></View>
                <View style={styles.paymentLine}><Text style={styles.paymentLabel}>A/C Name</Text><Text style={styles.paymentValue}>: {bank.bankAccountName || "-"}</Text></View>
                <View style={styles.paymentLine}><Text style={styles.paymentLabel}>A/C No</Text><Text style={styles.paymentValue}>: {bank.bankAccountNumber || "-"}</Text></View>
              </View>
            </View>
          ) : <View style={styles.paymentBox} />}

          <View style={styles.totalsBlock}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{fmt(invoice.subtotal)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text style={styles.totalValue}>{fmt(invoice.discount)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>DPP (Dasar Pengenaan Pajak)</Text><Text style={styles.totalValue}>{fmt(dpp)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>VAT (PPN) 11%</Text><Text style={styles.totalValue}>{fmt(invoice.tax)}</Text></View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>TOTAL AMOUNT</Text>
              <Text style={styles.grandValue}>{fmt(invoice.grandTotal)}</Text>
            </View>
            {dueAmount !== null && (
              <View style={styles.dueRow}>
                <Text style={styles.dueLabel}>TOTAL AMOUNT DUE (DP {invoice.dpPercent}% inc. VAT)</Text>
                <Text style={styles.dueValue}>{fmt(dueAmount)}</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.termsTitle}>Terms &amp; Conditions</Text>
        {DEFAULT_INVOICE_TERMS.map((t, i) => (
          <Text key={i} style={styles.termsLine}>{i + 1}. {t}</Text>
        ))}

        {stamp && (
          <View style={styles.stampWrap}>
            <Image src={stamp} style={styles.stampImg} />
          </View>
        )}
      </Page>
    </Document>
  );
}
