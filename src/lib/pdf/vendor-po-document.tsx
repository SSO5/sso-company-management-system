/* eslint-disable jsx-a11y/alt-text -- react-pdf Image renders into a PDF, not HTML */
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { formatMoneyForPdf } from "@/lib/pdf/format";
import type { PdfImageSrc } from "@/lib/pdf/branding";

/**
 * Vendor/procurement Purchase Order PDF — SSO issuing a PO TO a supplier
 * (e.g. "PT ATHENA TEKNIK PERKASA"), NOT the customer-received PO. Matches
 * a real issued PO ("001/PO/PRO/VII/2026") field-for-field: TO (VENDOR) /
 * DELIVERY ADDRESS boxes, Quotation Ref / Payment Terms / Project Ref /
 * Delivery Terms grid, grouped item table, Sub Total / Discount / Netto /
 * TAX / TOTAL AMOUNT box, a Note/Ketentuan block, and a two-signer footer
 * ("Authorized by SSO" + blank "CONFIRMATION (Vendor)" line).
 */
const NAVY = "#1F3864";
const BORDER = "#CBD5E1";
const GRAY = "#6B7280";
const DARK = "#111827";
const LIGHT_BG = "#F3F4F6";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica", color: DARK },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 100, height: 26, objectFit: "contain", marginBottom: 4 },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  companyLine: { fontSize: 7.5, color: GRAY, marginTop: 1.5, maxWidth: 260 },
  docTitleBlock: { alignItems: "flex-end" },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  docMetaLine: { fontSize: 8, marginTop: 3 },
  docMetaLabel: { color: GRAY },

  headerRule: { borderTopWidth: 2, borderTopColor: DARK, marginTop: 10, marginBottom: 12 },

  boxRow: { flexDirection: "row" },
  box: { flex: 1, borderWidth: 0.75, borderColor: BORDER },
  boxSpacer: { width: 12 },
  boxHeader: { backgroundColor: NAVY, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8, padding: 5 },
  boxBody: { padding: 8 },
  boxBodyBold: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginBottom: 3 },
  boxBodyLine: { fontSize: 8, color: "#374151", marginBottom: 1.5, lineHeight: 1.3 },
  boxBodyLabel: { color: GRAY },

  infoGrid: { flexDirection: "row", borderWidth: 0.75, borderColor: BORDER, marginTop: 12 },
  infoCell: { flex: 1, borderRightWidth: 0.75, borderRightColor: BORDER, padding: 6 },
  infoCellLast: { flex: 1, padding: 6 },
  infoLabel: { fontSize: 7, color: GRAY },
  infoValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 2 },

  table: { marginTop: 16 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY },
  tableHeaderCell: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7.5, padding: 5 },
  groupRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER, backgroundColor: "#EEF2F7" },
  groupCell: { fontFamily: "Helvetica-Bold", fontSize: 8.5, padding: 5 },
  itemRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  itemCell: { fontSize: 8, padding: 5, color: "#1F2937" },

  colNo: { width: "6%" },
  colDesc: { width: "40%" },
  colQty: { width: "10%", textAlign: "right" },
  colUnit: { width: "10%" },
  colPrice: { width: "17%", textAlign: "right" },
  colAmount: { width: "17%", textAlign: "right" },

  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  totalsBlock: { width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 4 },
  totalLabel: { fontSize: 8.5, color: "#374151" },
  totalValue: { fontSize: 8.5 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: NAVY, padding: 6, marginTop: 3 },
  grandLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },
  grandValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },

  notesBox: { backgroundColor: LIGHT_BG, padding: 8, marginTop: 16, borderLeftWidth: 2.5, borderLeftColor: NAVY },
  notesTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.5, marginBottom: 3 },
  notesLine: { fontSize: 8, color: "#374151", lineHeight: 1.4, marginBottom: 1 },

  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 34 },
  signCol: { width: "45%" },
  signColLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  signatureBlockWrap: { marginTop: 6, height: 78, position: "relative" },
  stampImg: { position: "absolute", top: 0, left: 20, width: 68, height: 68, opacity: 0.9, objectFit: "contain" },
  signatureImg: { position: "absolute", top: 2, left: 0, width: 110, height: 54, objectFit: "contain" },
  signLine: { marginTop: 6, width: 170, borderTopWidth: 0.75, borderTopColor: DARK },
  signerName: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 3 },
  signerTitle: { fontSize: 8, color: GRAY },
  blankSignLine: { marginTop: 78, width: 170, borderTopWidth: 0.75, borderTopColor: DARK },
  blankSignCaption: { fontSize: 7.5, color: GRAY, marginTop: 3, textAlign: "center", width: 170 },
});

interface CompanyInfo {
  companyName: string;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
}

interface VendorPoPdfProps {
  po: {
    number: string;
    poDate: Date;
    quotationRef: string | null;
    projectRef: string | null;
    paymentTerms: string | null;
    deliveryTerms: string | null;
    vendorName: string;
    vendorAddress: string | null;
    vendorEmail: string | null;
    vendorAttn: string | null;
    deliveryName: string | null;
    deliveryAddress: string | null;
    deliveryAttn: string | null;
    items: { groupLabel: string | null; description: string; quantity: number; unit: string; unitPrice: number; amount: number }[];
    subtotal: number;
    discount: number;
    taxPercent: number;
    tax: number;
    grandTotal: number;
    notes: string | null;
  };
  company: CompanyInfo;
  signer: { name: string; title: string | null };
  logo: PdfImageSrc | null;
  signature: PdfImageSrc | null;
  stamp: PdfImageSrc | null;
}

export function VendorPoPdfDocument({ po, company, signer, logo, signature, stamp }: VendorPoPdfProps) {
  const netto = po.subtotal - po.discount;
  const addressLine2 = company.addressLine2 || [company.city, company.province].filter(Boolean).join(", ");
  const dateStr = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(po.poDate);

  let lastGroup: string | null = "__none__";
  let groupIndex = 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {logo ? <Image src={logo} style={styles.logo} /> : null}
            <Text style={styles.companyName}>{company.companyName.toUpperCase()}</Text>
            {company.address ? <Text style={styles.companyLine}>{company.address}</Text> : null}
            {addressLine2 ? <Text style={styles.companyLine}>{addressLine2}</Text> : null}
            {company.phone ? <Text style={styles.companyLine}>{company.phone}</Text> : null}
          </View>
          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>PURCHASE ORDER</Text>
            <Text style={styles.docMetaLine}><Text style={styles.docMetaLabel}>PO NO : </Text>{po.number}</Text>
            <Text style={styles.docMetaLine}><Text style={styles.docMetaLabel}>Date : </Text>{dateStr}</Text>
            <Text style={styles.docMetaLine}><Text style={styles.docMetaLabel}>Page : </Text>1 of 1</Text>
          </View>
        </View>
        <View style={styles.headerRule} />

        <View style={styles.boxRow}>
          <View style={styles.box}>
            <Text style={styles.boxHeader}>TO (VENDOR) :</Text>
            <View style={styles.boxBody}>
              <Text style={styles.boxBodyBold}>{po.vendorName}</Text>
              {po.vendorAddress ? <Text style={styles.boxBodyLine}>{po.vendorAddress}</Text> : null}
              {po.vendorEmail ? <Text style={styles.boxBodyLine}><Text style={styles.boxBodyLabel}>Email  : </Text>{po.vendorEmail}</Text> : null}
              {po.vendorAttn ? <Text style={styles.boxBodyLine}><Text style={styles.boxBodyLabel}>Attn   : </Text>{po.vendorAttn}</Text> : null}
            </View>
          </View>
          <View style={styles.boxSpacer} />
          <View style={styles.box}>
            <Text style={styles.boxHeader}>DELIVERY ADDRESS :</Text>
            <View style={styles.boxBody}>
              <Text style={styles.boxBodyBold}>{po.deliveryName || "-"}</Text>
              {po.deliveryAddress ? <Text style={styles.boxBodyLine}>{po.deliveryAddress}</Text> : null}
              {po.deliveryAttn ? <Text style={styles.boxBodyLine}><Text style={styles.boxBodyLabel}>Attn   : </Text>{po.deliveryAttn}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Quotation Ref.</Text>
            <Text style={styles.infoValue}>{po.quotationRef || "-"}</Text>
          </View>
          <View style={styles.infoCellLast}>
            <Text style={styles.infoLabel}>Payment Terms</Text>
            <Text style={styles.infoValue}>{po.paymentTerms || "-"}</Text>
          </View>
        </View>
        <View style={[styles.infoGrid, { marginTop: -1 }]}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Project Ref.</Text>
            <Text style={styles.infoValue}>{po.projectRef || "-"}</Text>
          </View>
          <View style={styles.infoCellLast}>
            <Text style={styles.infoLabel}>Delivery Terms</Text>
            <Text style={styles.infoValue}>{po.deliveryTerms || "-"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, styles.colNo]}>No.</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.colUnit]}>Unit</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Unit Price</Text>
            <Text style={[styles.tableHeaderCell, styles.colAmount]}>Amount</Text>
          </View>
          {po.items.map((item, idx) => {
            // Boolean(...) matters: an empty-string groupLabel (not null)
            // would otherwise make `isNewGroup` itself an empty string, which
            // React-PDF renders as a raw text child and throws "Invalid ''
            // string child outside <Text>" — see invoice-document.tsx.
            const isNewGroup = Boolean(item.groupLabel) && item.groupLabel !== lastGroup;
            if (isNewGroup) {
              lastGroup = item.groupLabel;
              groupIndex += 1;
            }
            return (
              <View key={idx}>
                {isNewGroup && (
                  <View style={styles.groupRow} wrap={false}>
                    <Text style={[styles.groupCell, styles.colNo]}>{groupIndex}</Text>
                    <Text style={[styles.groupCell, styles.colDesc]}>{item.groupLabel}</Text>
                    <Text style={[styles.groupCell, styles.colQty]}></Text>
                    <Text style={[styles.groupCell, styles.colUnit]}></Text>
                    <Text style={[styles.groupCell, styles.colPrice]}></Text>
                    <Text style={[styles.groupCell, styles.colAmount]}></Text>
                  </View>
                )}
                <View style={styles.itemRow} wrap={false}>
                  <Text style={[styles.itemCell, styles.colNo]}></Text>
                  <Text style={[styles.itemCell, styles.colDesc, { paddingLeft: item.groupLabel ? 14 : 5 }]}>{item.description}</Text>
                  <Text style={[styles.itemCell, styles.colQty]}>{item.quantity.toFixed(2)}</Text>
                  <Text style={[styles.itemCell, styles.colUnit]}>{item.unit}</Text>
                  <Text style={[styles.itemCell, styles.colPrice]}>{formatMoneyForPdf(item.unitPrice).replace("Rp ", "IDR ").replace(",00", "")}</Text>
                  <Text style={[styles.itemCell, styles.colAmount]}>{formatMoneyForPdf(item.amount).replace("Rp ", "IDR ").replace(",00", "")}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalsBlock}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sub Total</Text>
              <Text style={styles.totalValue}>IDR {formatMoneyForPdf(po.subtotal).replace("Rp ", "").replace(",00", "")}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={styles.totalValue}>IDR {formatMoneyForPdf(po.discount).replace("Rp ", "").replace(",00", "")}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Netto</Text>
              <Text style={styles.totalValue}>IDR {formatMoneyForPdf(netto).replace("Rp ", "").replace(",00", "")}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TAX {po.taxPercent}%</Text>
              <Text style={styles.totalValue}>IDR {formatMoneyForPdf(po.tax).replace("Rp ", "").replace(",00", "")}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>TOTAL AMOUNT</Text>
              <Text style={styles.grandValue}>IDR {formatMoneyForPdf(po.grandTotal).replace("Rp ", "").replace(",00", "")}</Text>
            </View>
          </View>
        </View>

        {po.notes ? (
          <View style={styles.notesBox} wrap={false}>
            <Text style={styles.notesTitle}>Note / Ketentuan :</Text>
            {po.notes.split("\n").filter(Boolean).map((line, i) => (
              <Text key={i} style={styles.notesLine}>{line}</Text>
            ))}
          </View>
        ) : null}

        <View style={styles.signRow} wrap={false}>
          <View style={styles.signCol}>
            <Text style={styles.signColLabel}>Authorized by SSO</Text>
            <View style={styles.signatureBlockWrap}>
              {stamp && <Image src={stamp} style={styles.stampImg} />}
              {signature && <Image src={signature} style={styles.signatureImg} />}
            </View>
            <View style={styles.signLine} />
            <Text style={styles.signerName}>{signer.name}</Text>
            <Text style={styles.signerTitle}>{signer.title || ""}</Text>
          </View>
          <View style={styles.signCol}>
            <Text style={styles.signColLabel}>CONFIRMATION (Vendor)</Text>
            <View style={styles.blankSignLine} />
            <Text style={styles.blankSignCaption}>Sign &amp; Company Stamp</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
