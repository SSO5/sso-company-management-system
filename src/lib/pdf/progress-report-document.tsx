import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { PdfImageSrc } from "@/lib/pdf/branding";

/**
 * Reproduces the progress report SSO already sends to JPC, rather than
 * inventing a new layout.
 *
 * That report is the format the customer's engineering team has been reading
 * since July: a header block (tanggal inspeksi / no. dokumen / lokasi /
 * disusun oleh / project) over a table of No · Bagian yang di cek · Foto
 * sebelum · Foto sesudah · Keterangan, grouped by unit. Changing it would
 * mean SSO's own document and the app's document look like two different
 * companies, and the team would keep making the real one by hand.
 *
 * The letterhead (logo top-left, company name/address block top-right, rule
 * beneath, repeated on every page) matches SSO's real "LAPORAN INSPEKSI
 * TEKNIS" letterhead exactly — same Header/Footer pattern already used in
 * quotation-document.tsx, so every SSO PDF shares one letterhead standard.
 *
 * One thing is ADDED, because it was the actual complaint: a summary block for
 * management. The checkpoint table answers "what was done to which part" — it
 * never answered "how far along is this job and is it on time". That question
 * now sits at the top, where someone who reads only the first page will see it.
 */

const NAVY = "#1F3864";
const GOLD = "#D99A2B";
const BORDER = "#D8DCE3";
const GRAY_BODY = "#4B5563";

const s = StyleSheet.create({
  page: { paddingTop: 74, paddingBottom: 40, paddingHorizontal: 26, fontSize: 8, fontFamily: "Helvetica", color: "#101828" },

  // Letterhead — logo left, company block right, rule beneath — repeated on every page.
  headerFixed: { position: "absolute", top: 20, left: 26, right: 26, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerRuleWrap: { position: "absolute", top: 54, left: 26, right: 26 },
  headerRule: { borderTopWidth: 0.75, borderTopColor: BORDER },
  logo: { width: 88, height: 23, objectFit: "contain" },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827" },
  companyLine: { fontSize: 7, color: GRAY_BODY, marginTop: 1 },

  title: { fontSize: 12, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 8, letterSpacing: 0.3 },

  metaBox: { borderWidth: 0.75, borderColor: BORDER, borderRadius: 3, marginBottom: 8, overflow: "hidden" },
  metaRow: { flexDirection: "row", borderBottomWidth: 0.75, borderColor: BORDER },
  metaCell: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, flexDirection: "row" },
  metaLabel: { width: 68, color: "#667085" },
  metaValue: { flex: 1, fontFamily: "Helvetica-Bold", color: "#101828" },
  projectBar: { backgroundColor: NAVY, color: "#FFFFFF", paddingVertical: 4, paddingHorizontal: 6, fontFamily: "Helvetica-Bold", fontSize: 8.5 },

  summaryBox: { borderWidth: 0.75, borderColor: BORDER, borderRadius: 3, backgroundColor: "#F8FAFC", padding: 8, marginBottom: 10 },
  summaryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  summaryTitle: { fontFamily: "Helvetica-Bold", fontSize: 8, color: NAVY, letterSpacing: 0.4 },
  pctWrap: { flexDirection: "row", alignItems: "center" },
  pctLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, color: NAVY, marginRight: 6 },
  barTrack: { width: 90, height: 5, backgroundColor: "#E4E7EC", borderRadius: 2.5 },
  barFill: { height: 5, backgroundColor: GOLD, borderRadius: 2.5 },
  summaryText: { lineHeight: 1.4, color: "#344054" },

  thead: { flexDirection: "row", backgroundColor: NAVY },
  th: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7, paddingVertical: 5, paddingHorizontal: 4, textAlign: "center", letterSpacing: 0.4 },

  sectionRow: { flexDirection: "row", alignItems: "stretch", backgroundColor: "#EEF2F7", borderBottomWidth: 0.75, borderColor: BORDER },
  sectionAccent: { width: 3, backgroundColor: GOLD },
  sectionText: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: NAVY, paddingVertical: 4, paddingHorizontal: 6, letterSpacing: 0.3 },

  tr: { flexDirection: "row", borderBottomWidth: 0.75, borderColor: BORDER, minHeight: 54 },
  trAlt: { backgroundColor: "#FAFBFC" },
  td: { paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 0.75, borderColor: BORDER },
  photoCell: { alignItems: "center", justifyContent: "center" },
  photo: { maxHeight: 62, maxWidth: 86, objectFit: "contain" },
  noPhoto: { color: "#98A2B3", fontSize: 7 },

  doneTag: { color: "#067647", fontFamily: "Helvetica-Bold", fontSize: 7, marginTop: 2 },
  openTag: { color: "#B54708", fontFamily: "Helvetica-Bold", fontSize: 7, marginTop: 2 },

  signWrap: { marginTop: 18, flexDirection: "row", justifyContent: "flex-end" },
  signBox: { width: 170, alignItems: "center" },
  signImg: { height: 42, marginVertical: 3 },
  signName: { fontFamily: "Helvetica-Bold", borderTopWidth: 0.75, borderColor: "#98A2B3", paddingTop: 3, width: "100%", textAlign: "center" },
  signTitle: { color: "#475467", fontSize: 7.5 },

  footerFixed: { position: "absolute", bottom: 16, left: 26, right: 26 },
  footerRule: { borderTopWidth: 0.75, borderTopColor: BORDER, marginBottom: 5 },
  footerRow: { flexDirection: "row", justifyContent: "space-between" },
  footerText: { color: "#98A2B3", fontSize: 7 },
});

// Column widths must total 100%. Photos get the most room because they are the
// evidence — the reason the customer reads this document at all.
const W = { no: "5%", part: "24%", before: "22%", after: "22%", notes: "27%" };

interface CompanyInfo {
  companyName: string;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
}

export interface ProgressReportPdfItem {
  sectionName: string | null;
  partName: string;
  notes: string | null;
  isDone: boolean;
  photoBefore: PdfImageSrc | null;
  photoAfter: PdfImageSrc | null;
}

export interface ProgressReportPdfProps {
  report: {
    number: string;
    inspectionDate: Date;
    location: string | null;
    summary: string | null;
    overallPercent: number | null;
    preparedByName: string;
    preparedByTitle: string | null;
    projectNumber: string;
    projectName: string;
    customerName: string;
    items: ProgressReportPdfItem[];
  };
  company: CompanyInfo;
  logo: PdfImageSrc | null;
  signature: PdfImageSrc | null;
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(d));
}

function Header({ company, logo }: { company: CompanyInfo; logo: PdfImageSrc | null }) {
  const line2 = company.addressLine2 || [company.city, company.province].filter(Boolean).join(", ");
  return (
    <>
      <View style={s.headerFixed} fixed>
        {logo ? <Image src={logo} style={s.logo} /> : <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: NAVY }}>SINERGI</Text>}
        <View style={s.companyBlock}>
          <Text style={s.companyName}>{company.companyName.toUpperCase()}</Text>
          {company.address ? <Text style={s.companyLine}>{company.address}</Text> : null}
          {line2 ? <Text style={s.companyLine}>{line2}</Text> : null}
        </View>
      </View>
      <View style={s.headerRuleWrap} fixed><View style={s.headerRule} /></View>
    </>
  );
}

function Footer({ company, report }: { company: CompanyInfo; report: { number: string } }) {
  return (
    <View style={s.footerFixed} fixed>
      <View style={s.footerRule} />
      <View style={s.footerRow}>
        <Text style={s.footerText}>{company.companyName} · {report.number}</Text>
        <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
      </View>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaCell}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>: {value}</Text>
    </View>
  );
}

function PhotoCell({ img, width }: { img: PdfImageSrc | null; width: string }) {
  return (
    <View style={[s.td, s.photoCell, { width }]}>
      {img ? <Image src={img} style={s.photo} /> : <Text style={s.noPhoto}>—</Text>}
    </View>
  );
}

export function ProgressReportPdfDocument({ report, company, logo, signature }: ProgressReportPdfProps) {
  // Group while preserving the order items were entered, so the printed
  // sequence matches what the person filling the form saw on screen.
  const groups: { name: string; items: ProgressReportPdfItem[] }[] = [];
  for (const item of report.items) {
    const name = item.sectionName?.trim() || "PEMERIKSAAN";
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(item);
    else groups.push({ name, items: [item] });
  }

  const done = report.items.filter((i) => i.isDone).length;
  const pct = report.overallPercent ?? (report.items.length ? Math.round((done / report.items.length) * 100) : 0);

  return (
    <Document title={`Progress Report ${report.number}`} author={company.companyName}>
      <Page size="A4" style={s.page}>
        <Header company={company} logo={logo} />

        <Text style={s.title}>LAPORAN INSPEKSI TEKNIS (INSPECTION REPORT)</Text>

        <View style={s.metaBox}>
          <View style={s.metaRow}>
            <Meta label="Tanggal Inspeksi" value={fmtDate(report.inspectionDate)} />
            <Meta label="No. Dokumen" value={report.number} />
          </View>
          <View style={s.metaRow}>
            <Meta label="Lokasi" value={report.location || "-"} />
            <Meta label="Disusun oleh" value={report.preparedByName} />
          </View>
          <Text style={s.projectBar}>
            PROJECT : {report.projectNumber} — {report.projectName} · {report.customerName}
          </Text>
        </View>

        {/* Management block. Rendered even with no written summary, because the
            completion figure alone already answers most of the question. */}
        <View style={s.summaryBox}>
          <View style={s.summaryHead}>
            <Text style={s.summaryTitle}>RINGKASAN UNTUK MANAJEMEN</Text>
            <View style={s.pctWrap}>
              <Text style={s.pctLabel}>{pct}% selesai</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
              </View>
            </View>
          </View>
          <Text style={s.summaryText}>
            {report.summary?.trim() ||
              `${done} dari ${report.items.length} titik pemeriksaan telah selesai. Rincian per bagian beserta dokumentasi foto tercantum di bawah.`}
          </Text>
        </View>

        <View style={s.thead} fixed>
          <Text style={[s.th, { width: W.no }]}>No.</Text>
          <Text style={[s.th, { width: W.part }]}>Bagian yang di cek</Text>
          <Text style={[s.th, { width: W.before }]}>Foto sebelum</Text>
          <Text style={[s.th, { width: W.after }]}>Foto sesudah</Text>
          <Text style={[s.th, { width: W.notes }]}>Keterangan</Text>
        </View>

        {groups.map((g, gi) => (
          <View key={`${g.name}-${gi}`}>
            <View style={s.sectionRow} wrap={false}>
              <View style={s.sectionAccent} />
              <Text style={s.sectionText}>{g.name.toUpperCase()}</Text>
            </View>
            {g.items.map((item, i) => (
              <View key={`${gi}-${i}`} style={[s.tr, ...(i % 2 === 1 ? [s.trAlt] : [])]} wrap={false}>
                <Text style={[s.td, { width: W.no, textAlign: "center" }]}>{i + 1}</Text>
                <Text style={[s.td, { width: W.part }]}>{item.partName}</Text>
                <PhotoCell img={item.photoBefore} width={W.before} />
                <PhotoCell img={item.photoAfter} width={W.after} />
                <View style={[s.td, { width: W.notes, borderRightWidth: 0 }]}>
                  <Text>{item.notes || "-"}</Text>
                  <Text style={item.isDone ? s.doneTag : s.openTag}>
                    {item.isDone ? "SELESAI" : "DALAM PROSES"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={s.signWrap} wrap={false}>
          <View style={s.signBox}>
            <Text>Disusun oleh,</Text>
            {signature ? <Image src={signature} style={s.signImg} /> : <View style={{ height: 42 }} />}
            <Text style={s.signName}>{report.preparedByName}</Text>
            <Text style={s.signTitle}>{report.preparedByTitle || "Engineering"}</Text>
          </View>
        </View>

        <Footer company={company} report={report} />
      </Page>
    </Document>
  );
}
