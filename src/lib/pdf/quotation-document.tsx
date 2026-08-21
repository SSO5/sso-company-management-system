import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { formatMoneyForPdf, formatPdfDate } from "@/lib/pdf/format";
import type { PdfImageSrc } from "@/lib/pdf/branding";

/**
 * Replicates SSO's real Quotation PDF SOP exactly (verified against
 * "003_QUO_MKT_VI_2026 Penawaran Fabrikasi Frame roller PT NCS R2.pdf"):
 * page 1 is a cover letter, page 2 is the price breakdown table + the
 * six-item "Commercial Provisions" terms grid. Colors/fonts are a close
 * match (Helvetica in place of the original's exact typeface, since we
 * don't have the original font file) — flag anything that looks off and
 * it's a quick style tweak, not a rebuild.
 */
const NAVY = "#1F3864";
const GOLD = "#D99A2B";
const GRAY_LABEL = "#8A8F98";
const GRAY_BODY = "#4B5563";
const BORDER = "#E5E7EB";

const styles = StyleSheet.create({
  page: { paddingTop: 90, paddingBottom: 60, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1F2937" },
  headerFixed: { position: "absolute", top: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerRuleWrap: { position: "absolute", top: 64, left: 40, right: 40 },
  headerRule: { borderTopWidth: 0.75, borderTopColor: BORDER },
  logo: { width: 110, height: 28, objectFit: "contain" },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111827" },
  companyLine: { fontSize: 7.5, color: GRAY_BODY, marginTop: 1 },
  footerFixed: { position: "absolute", bottom: 24, left: 40, right: 40 },
  footerRule: { borderTopWidth: 1.5, borderTopColor: GOLD, marginBottom: 6 },
  footerText: { fontSize: 7, color: GRAY_BODY, textAlign: "center" },

  title: { fontSize: 26, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 14 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  metaLabel: { fontSize: 7.5, color: GRAY_LABEL, marginBottom: 2 },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111827" },

  sectionLabel: { fontSize: 7.5, color: GRAY_LABEL, marginBottom: 2 },
  attnName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 1 },
  attnLine: { fontSize: 10, color: "#1F2937", marginBottom: 1 },

  divider: { borderTopWidth: 0.75, borderTopColor: BORDER, marginVertical: 14 },

  bodyText: { fontSize: 10, lineHeight: 1.5, color: "#1F2937", marginBottom: 10 },
  bold: { fontFamily: "Helvetica-Bold" },

  // Signature is bottom-anchored inside this fixed-height box so it sits
  // right on top of the line — instead of floating near the top with the
  // line pushed far below (signLine used to be a separate sibling with its
  // OWN marginTop stacked on top of this box's full height, nearly
  // doubling the gap). No company stamp here by request — signature only.
  signatureBlockWrap: { marginTop: 14, height: 64, position: "relative" },
  signatureImg: { position: "absolute", bottom: 4, left: 0, width: 130, height: 52, objectFit: "contain" },
  signLine: { position: "absolute", bottom: 0, left: 0, width: 150, borderTopWidth: 0.75, borderTopColor: "#111827" },
  signerName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 3 },
  signerTitle: { fontSize: 9, color: GRAY_BODY },

  sectionTag: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 0.5, marginBottom: 3 },
  sectionTitle: { fontSize: 17, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 12 },

  table: { marginBottom: 4 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY },
  tableHeaderCell: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8, padding: 5 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tableCell: { fontSize: 8.5, padding: 5, color: "#1F2937" },

  colItemNo: { width: "7%" },
  colDescription: { width: "24%" },
  colSpec: { width: "20%" },
  colQty: { width: "7%", textAlign: "right" },
  colUnit: { width: "7%" },
  // Wide enough (plus a slightly smaller font below) to fit a full
  // "Rp 1.234.567,00" on one line — these used to be 13.5%, narrow enough
  // that "Rp" wrapped onto its own line above the number.
  colUnitPrice: { width: "17.5%", textAlign: "right" },
  colTotalPrice: { width: "17.5%", textAlign: "right" },
  moneyCell: { fontSize: 8 },

  totalRow: { flexDirection: "row", marginTop: 2 },
  totalLabelBox: { width: "79%", backgroundColor: NAVY, padding: 6, alignItems: "flex-end" },
  totalLabelText: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 9 },
  totalValueBox: { width: "21%", backgroundColor: "#F3F4F6", padding: 6, alignItems: "flex-end" },
  totalValueText: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#111827" },

  termsGrid: { flexDirection: "row", marginTop: 4 },
  termsCol: { width: "50%", paddingRight: 12 },
  termItem: { flexDirection: "row", marginBottom: 12 },
  termNumber: { width: 20, fontSize: 10, fontFamily: "Helvetica-Bold", color: GOLD },
  termBody: { flex: 1 },
  termTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#111827", marginBottom: 2 },
  termText: { fontSize: 8.5, color: GRAY_BODY, lineHeight: 1.4 },
});

interface CompanyInfo {
  companyName: string;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
}

interface QuotationPdfProps {
  quotation: {
    number: string;
    quotationDate: Date;
    subjectLine: string | null;
    description: string | null;
    commercialTerms: { title: string; body: string }[] | null;
    items: {
      itemName: string;
      description: string | null;
      technicalSpec: string | null;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
    }[];
    grandTotal: number;
  };
  customer: { companyName: string };
  contact: { salutation: string | null; name: string; position: string | null } | null;
  company: CompanyInfo;
  signer: { name: string; title: string | null };
  logo: PdfImageSrc | null;
  signature: PdfImageSrc | null;
}

function Header({ company, logo }: { company: CompanyInfo; logo: PdfImageSrc | null }) {
  // Second line falls back to city/province if addressLine2 isn't filled in
  // yet (Settings > Company Settings), so existing companies with only the
  // old single-line address don't regress to a blank line.
  const line2 = company.addressLine2 || [company.city, company.province].filter(Boolean).join(", ");
  return (
    <>
      <View style={styles.headerFixed} fixed>
        {logo ? <Image src={logo} style={styles.logo} /> : <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY }}>SINERGI</Text>}
        <View style={styles.companyBlock}>
          <Text style={styles.companyName}>{company.companyName.toUpperCase()}</Text>
          {company.address ? <Text style={styles.companyLine}>{company.address}</Text> : null}
          {line2 ? <Text style={styles.companyLine}>{line2}</Text> : null}
          {company.phone ? <Text style={styles.companyLine}>Indonesia · {company.phone}</Text> : null}
        </View>
      </View>
      <View style={styles.headerRuleWrap} fixed><View style={styles.headerRule} /></View>
    </>
  );
}

function Footer({ company }: { company: CompanyInfo }) {
  const addressLine = [company.address, company.addressLine2 || company.city].filter(Boolean).join(" · ");
  return (
    <View style={styles.footerFixed} fixed>
      <View style={styles.footerRule} />
      <Text style={styles.footerText}>
        {company.companyName.toUpperCase()} · {addressLine} {company.phone ? `· ${company.phone}` : ""}
      </Text>
    </View>
  );
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export function QuotationPdfDocument({ quotation, customer, contact, company, signer, logo, signature }: QuotationPdfProps) {
  const terms = quotation.commercialTerms && quotation.commercialTerms.length > 0 ? quotation.commercialTerms : [];
  const leftTerms = terms.slice(0, Math.ceil(terms.length / 2));
  const rightTerms = terms.slice(Math.ceil(terms.length / 2));
  const heading = quotation.subjectLine || quotation.description || "Quotation";
  const greetingName = contact ? `${contact.salutation ? contact.salutation + " " : ""}${firstName(contact.name)}` : customer.companyName;

  return (
    <Document>
      {/* PAGE 1 — cover letter */}
      <Page size="A4" style={styles.page}>
        <Header company={company} logo={logo} />
        <Footer company={company} />

        <Text style={styles.title}>QUOTATION</Text>
        <View style={styles.metaRow}>
          <View>
            <Text style={styles.metaLabel}>REF. NO</Text>
            <Text style={styles.metaValue}>{quotation.number}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>DATE</Text>
            <Text style={styles.metaValue}>{formatPdfDate(quotation.quotationDate, company.city || "Jakarta")}</Text>
          </View>
        </View>

        {contact && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionLabel}>ATTENTION TO</Text>
            <Text style={styles.attnName}>{contact.salutation ? `${contact.salutation} ` : ""}{contact.name}</Text>
            {contact.position && <Text style={styles.attnLine}>{contact.position}</Text>}
            <Text style={styles.attnLine}>{customer.companyName}</Text>
          </View>
        )}

        <View style={{ marginBottom: 4 }}>
          <Text style={styles.sectionLabel}>SUBJECT</Text>
          <Text style={styles.attnLine}>{heading}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.bodyText}>Dear {greetingName},{"\n"}Thank you for your continued interest in our services.</Text>

        <Text style={styles.bodyText}>
          <Text style={styles.bold}>{company.companyName} (&quot;SSO&quot;)</Text> is pleased to submit the enclosed quotation for the supply of{" "}
          {heading.replace(/^Quotation\s*[-—]\s*/i, "")}, prepared in accordance with your specifications. A detailed breakdown of scope,
          specifications, and commercial terms is provided in the appendices attached to this document.
        </Text>

        <Text style={styles.bodyText}>
          We trust that this proposal meets the expectations of <Text style={styles.bold}>{customer.companyName}</Text> and look forward to the
          opportunity of collaborating with your esteemed organization. Should you require any further clarification, please do not hesitate to
          contact us at your convenience.
        </Text>

        <Text style={{ fontSize: 10, marginTop: 8 }}>Sincerely yours,</Text>

        <View style={styles.signatureBlockWrap}>
          {signature && <Image src={signature} style={styles.signatureImg} />}
          <View style={styles.signLine} />
        </View>
        <Text style={styles.signerName}>{signer.name}</Text>
        <Text style={styles.signerTitle}>{signer.title ? `${signer.title} · ` : ""}{company.companyName}</Text>
      </Page>

      {/* PAGE 2 — breakdown price + commercial terms */}
      <Page size="A4" style={styles.page}>
        <Header company={company} logo={logo} />
        <Footer company={company} />

        <Text style={styles.sectionTag}>A. BREAKDOWN PRICE</Text>
        <Text style={styles.sectionTitle}>{heading}</Text>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, styles.colItemNo]}>Item No</Text>
            <Text style={[styles.tableHeaderCell, styles.colDescription]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colSpec]}>Technical Specification</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.colUnit]}>Unit</Text>
            <Text style={[styles.tableHeaderCell, styles.colUnitPrice]}>Unit Price (IDR)</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotalPrice]}>Total Price (IDR)</Text>
          </View>
          {quotation.items.map((item, idx) => (
            <View style={styles.tableRow} key={idx} wrap={false}>
              <Text style={[styles.tableCell, styles.colItemNo]}>{idx + 1}</Text>
              <Text style={[styles.tableCell, styles.colDescription]}>{item.itemName}{item.description ? `\n${item.description}` : ""}</Text>
              <Text style={[styles.tableCell, styles.colSpec]}>{item.technicalSpec || ""}</Text>
              <Text style={[styles.tableCell, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.tableCell, styles.colUnit]}>{item.unit}</Text>
              <Text style={[styles.tableCell, styles.colUnitPrice, styles.moneyCell]}>{formatMoneyForPdf(item.unitPrice)}</Text>
              <Text style={[styles.tableCell, styles.colTotalPrice, styles.moneyCell]}>{formatMoneyForPdf(item.total)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.totalRow} wrap={false}>
          <View style={styles.totalLabelBox}><Text style={styles.totalLabelText}>TOTAL</Text></View>
          <View style={styles.totalValueBox}><Text style={styles.totalValueText}>{formatMoneyForPdf(quotation.grandTotal)}</Text></View>
        </View>

        <View style={{ marginTop: 26 }}>
          <Text style={styles.sectionTag}>B. TERMS &amp; CONDITIONS</Text>
          <Text style={styles.sectionTitle}>Commercial Provisions</Text>
        </View>

        <View style={styles.termsGrid}>
          <View style={styles.termsCol}>
            {leftTerms.map((t, i) => (
              <View style={styles.termItem} key={i}>
                <Text style={styles.termNumber}>{String(i + 1).padStart(2, "0")}</Text>
                <View style={styles.termBody}>
                  <Text style={styles.termTitle}>{t.title}</Text>
                  <Text style={styles.termText}>{t.body}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.termsCol}>
            {rightTerms.map((t, i) => (
              <View style={styles.termItem} key={i}>
                <Text style={styles.termNumber}>{String(i + 1 + leftTerms.length).padStart(2, "0")}</Text>
                <View style={styles.termBody}>
                  <Text style={styles.termTitle}>{t.title}</Text>
                  <Text style={styles.termText}>{t.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
