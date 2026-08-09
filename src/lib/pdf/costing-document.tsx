import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatMoneyForPdf, formatPdfDate } from "@/lib/pdf/format";

/**
 * Replicates SSO's real costing worksheet exactly (verified line-by-line
 * against "COSTING JPC - GEARBOX.pdf" in an earlier pass — same column set,
 * same TOTAL KESELURUHAN row, same Ringkasan Profitabilitas block with
 * Operasional / PPN / PPh Final / Net Profit). Internal working document,
 * so no customer-facing letterhead — just company name + sheet metadata.
 */
const NAVY = "#1F3864";
const GRAY_LABEL = "#8A8F98";
const GRAY_BODY = "#4B5563";
const BORDER = "#E5E7EB";
const GREEN_BG = "#E7F5EC";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1F2937" },
  companyName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GRAY_BODY },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 6, marginBottom: 10 },

  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14, borderWidth: 0.75, borderColor: BORDER },
  metaCell: { width: "50%", flexDirection: "row", padding: 5, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  metaLabel: { width: 100, fontSize: 8, color: GRAY_LABEL },
  metaValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", flex: 1 },

  sectionHeaderBar: { backgroundColor: "#EEF2F7", padding: 4, marginTop: 8, marginBottom: 2 },
  sectionHeaderText: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY },

  table: { marginTop: 4 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY },
  tableHeaderCell: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7, padding: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tableCell: { fontSize: 7.5, padding: 4, color: "#1F2937" },
  totalRow: { flexDirection: "row", backgroundColor: "#F3F4F6", borderTopWidth: 1, borderTopColor: NAVY },
  totalCell: { fontSize: 7.5, fontFamily: "Helvetica-Bold", padding: 4, color: "#111827" },

  colDesc: { width: "22%" },
  colQty: { width: "6%", textAlign: "right" },
  colUnit: { width: "6%" },
  colCostUnit: { width: "11%", textAlign: "right" },
  colMargin: { width: "6%", textAlign: "right" },
  colSellUnit: { width: "11%", textAlign: "right" },
  colCostTotal: { width: "12%", textAlign: "right" },
  colSellTotal: { width: "13%", textAlign: "right" },
  colProfit: { width: "13%", textAlign: "right" },

  summaryWrap: { marginTop: 22, alignItems: "flex-end" },
  summaryBox: { width: 300, borderWidth: 0.75, borderColor: BORDER },
  summaryTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY, padding: 6, backgroundColor: "#EEF2F7" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  summaryRowStrong: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 4, borderTopWidth: 0.75, borderTopColor: "#111827" },
  summaryRowHighlight: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 4, backgroundColor: GREEN_BG },
  summaryLabel: { fontSize: 8, color: GRAY_BODY },
  summaryLabelStrong: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827" },
  summaryValue: { fontSize: 8, color: "#111827" },
  summaryValueStrong: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827" },
});

interface CostingPdfProps {
  companyName: string;
  sheet: {
    number: string;
    projectTitle: string;
    jobNo: string | null;
    costingDate: Date;
  };
  customerName: string;
  sections: {
    name: string;
    items: {
      name: string;
      quantity: number;
      unit: string;
      costUnitPrice: number;
      marginPercent: number;
      sellingUnitPrice: number;
      costTotal: number;
      sellingTotalPrice: number;
    }[];
  }[];
  summary: {
    totalCost: number;
    totalRevenue: number;
    grossProfit: number;
    grossMarginPercent: number;
    operationalCost: number;
    ppnPercent: number;
    ppnAmount: number;
    pphFinalPercent: number;
    pphFinalAmount: number;
    netProfit: number;
    netMarginPercent: number;
  };
}

export function CostingPdfDocument({ companyName, sheet, customerName, sections, summary }: CostingPdfProps) {
  const showSectionHeaders = sections.length > 1;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.companyName}>{companyName.toUpperCase()}</Text>
        <Text style={styles.title}>COSTING SHEET — {sheet.projectTitle}</Text>

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}><Text style={styles.metaLabel}>No. Costing</Text><Text style={styles.metaValue}>{sheet.number}</Text></View>
          <View style={styles.metaCell}><Text style={styles.metaLabel}>Tanggal</Text><Text style={styles.metaValue}>{formatPdfDate(sheet.costingDate)}</Text></View>
          <View style={styles.metaCell}><Text style={styles.metaLabel}>Customer</Text><Text style={styles.metaValue}>{customerName}</Text></View>
          <View style={styles.metaCell}><Text style={styles.metaLabel}>Job No.</Text><Text style={styles.metaValue}>{sheet.jobNo || "-"}</Text></View>
        </View>

        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, styles.colDesc]}>Nama Item / Fabrication Description</Text>
          <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
          <Text style={[styles.tableHeaderCell, styles.colUnit]}>Unit</Text>
          <Text style={[styles.tableHeaderCell, styles.colCostUnit]}>Harga Pokok Satuan (Rp)</Text>
          <Text style={[styles.tableHeaderCell, styles.colMargin]}>Margin</Text>
          <Text style={[styles.tableHeaderCell, styles.colSellUnit]}>Harga Jual Satuan (Rp)</Text>
          <Text style={[styles.tableHeaderCell, styles.colCostTotal]}>Total Harga Pokok (COGS) (Rp)</Text>
          <Text style={[styles.tableHeaderCell, styles.colSellTotal]}>Total Harga Jual (Revenue) (Rp)</Text>
          <Text style={[styles.tableHeaderCell, styles.colProfit]}>Total Keuntungan (Profit) (Rp)</Text>
        </View>

        {sections.map((section, sIdx) => (
          <View key={sIdx}>
            {showSectionHeaders && (
              <View style={styles.sectionHeaderBar}><Text style={styles.sectionHeaderText}>{section.name}</Text></View>
            )}
            {section.items.map((item, iIdx) => (
              <View style={styles.tableRow} key={iIdx} wrap={false}>
                <Text style={[styles.tableCell, styles.colDesc]}>{item.name}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>{item.quantity}</Text>
                <Text style={[styles.tableCell, styles.colUnit]}>{item.unit}</Text>
                <Text style={[styles.tableCell, styles.colCostUnit]}>{formatMoneyForPdf(item.costUnitPrice)}</Text>
                <Text style={[styles.tableCell, styles.colMargin]}>{item.marginPercent}%</Text>
                <Text style={[styles.tableCell, styles.colSellUnit]}>{formatMoneyForPdf(item.sellingUnitPrice)}</Text>
                <Text style={[styles.tableCell, styles.colCostTotal]}>{formatMoneyForPdf(item.costTotal)}</Text>
                <Text style={[styles.tableCell, styles.colSellTotal]}>{formatMoneyForPdf(item.sellingTotalPrice)}</Text>
                <Text style={[styles.tableCell, styles.colProfit]}>{formatMoneyForPdf(item.sellingTotalPrice - item.costTotal)}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totalRow} wrap={false}>
          <Text style={[styles.totalCell, styles.colDesc]}>TOTAL KESELURUHAN</Text>
          <Text style={[styles.totalCell, styles.colQty]} />
          <Text style={[styles.totalCell, styles.colUnit]} />
          <Text style={[styles.totalCell, styles.colCostUnit]} />
          <Text style={[styles.totalCell, styles.colMargin]} />
          <Text style={[styles.totalCell, styles.colSellUnit]} />
          <Text style={[styles.totalCell, styles.colCostTotal]}>{formatMoneyForPdf(summary.totalCost)}</Text>
          <Text style={[styles.totalCell, styles.colSellTotal]}>{formatMoneyForPdf(summary.totalRevenue)}</Text>
          <Text style={[styles.totalCell, styles.colProfit]}>{formatMoneyForPdf(summary.grossProfit)}</Text>
        </View>

        <View style={styles.summaryWrap}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>RINGKASAN PROFITABILITAS (PROFITABILITY SUMMARY)</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Pendapatan (Total Revenue)</Text>
              <Text style={styles.summaryValue}>{formatMoneyForPdf(summary.totalRevenue)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Harga Pokok Penjualan (Total COGS)</Text>
              <Text style={styles.summaryValue}>{formatMoneyForPdf(summary.totalCost)}</Text>
            </View>
            <View style={styles.summaryRowStrong}>
              <Text style={styles.summaryLabelStrong}>Total Keuntungan Bersih (Gross Profit)</Text>
              <Text style={styles.summaryValueStrong}>{formatMoneyForPdf(summary.grossProfit)}</Text>
            </View>
            <View style={styles.summaryRowHighlight}>
              <Text style={styles.summaryLabelStrong}>Persentase Margin Keuntungan (Gross)</Text>
              <Text style={styles.summaryValueStrong}>{summary.grossMarginPercent.toFixed(0)}%</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>operasional</Text>
              <Text style={styles.summaryValue}>{formatMoneyForPdf(summary.operationalCost)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>PPN ({summary.ppnPercent}%)</Text>
              <Text style={styles.summaryValue}>{formatMoneyForPdf(summary.ppnAmount)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>PPh Final ({summary.pphFinalPercent}%)</Text>
              <Text style={styles.summaryValue}>{formatMoneyForPdf(summary.pphFinalAmount)}</Text>
            </View>
            <View style={styles.summaryRowStrong}>
              <Text style={styles.summaryLabelStrong}>NET PROFIT</Text>
              <Text style={styles.summaryValueStrong}>{formatMoneyForPdf(summary.netProfit)}</Text>
            </View>
            <View style={styles.summaryRowHighlight}>
              <Text style={styles.summaryLabelStrong}>Persentase Margin Keuntungan (net)</Text>
              <Text style={styles.summaryValueStrong}>{summary.netMarginPercent.toFixed(0)}%</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
