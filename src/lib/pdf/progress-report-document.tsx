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
 * One thing is ADDED, because it was the actual complaint: a summary block for
 * management. The checkpoint table answers "what was done to which part" — it
 * never answered "how far along is this job and is it on time". That question
 * now sits at the top, where someone who reads only the first page will see it.
 */

const NAVY = "#1F3864";
const BORDER = "#D0D5DD";

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 26, fontSize: 8, fontFamily: "Helvetica", color: "#101828" },

  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  logo: { height: 26, marginRight: 10 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", color: NAVY },

  metaBox: { borderWidth: 1, borderColor: NAVY, marginBottom: 8 },
  metaRow: { flexDirection: "row" },
  metaCell: { flex: 1, paddingVertical: 3, paddingHorizontal: 5, flexDirection: "row" },
  metaLabel: { width: 62, color: "#475467" },
  metaValue: { flex: 1, fontFamily: "Helvetica-Bold" },
  projectBar: { backgroundColor: NAVY, color: "#FFFFFF", paddingVertical: 3, paddingHorizontal: 5, fontFamily: "Helvetica-Bold", fontSize: 8.5 },

  summaryBox: { borderWidth: 1, borderColor: BORDER, backgroundColor: "#F8FAFC", padding: 7, marginBottom: 9 },
  summaryHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  summaryTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: NAVY },
  pctWrap: { flexDirection: "row", alignItems: "center" },
  pctLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, color: NAVY, marginRight: 5 },
  barTrack: { width: 90, height: 6, backgroundColor: "#E4E7EC" },
  barFill: { height: 6, backgroundColor: NAVY },
  summaryText: { lineHeight: 1.4, color: "#344054" },

  thead: { flexDirection: "row", backgroundColor: NAVY },
  th: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7.5, paddingVertical: 4, paddingHorizontal: 4, textAlign: "center" },

  sectionRow: { backgroundColor: "#EEF2F7", borderBottomWidth: 1, borderColor: BORDER },
  sectionText: { fontFamily: "Helvetica-Bold", fontSize: 8, color: NAVY, paddingVertical: 3, paddingHorizontal: 5 },

  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: BORDER, minHeight: 54 },
  td: { paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 1, borderColor: BORDER },
  photoCell: { alignItems: "center", justifyContent: "center" },
  photo: { maxHeight: 62, maxWidth: 86, objectFit: "contain" },
  noPhoto: { color: "#98A2B3", fontSize: 7 },

  doneTag: { color: "#067647", fontFamily: "Helvetica-Bold", fontSize: 7 },
  openTag: { color: "#B54708", fontFamily: "Helvetica-Bold", fontSize: 7 },

  signWrap: { marginTop: 16, flexDirection: "row", justifyContent: "flex-end" },
  signBox: { width: 170, alignItems: "center" },
  signImg: { height: 42, marginVertical: 3 },
  signName: { fontFamily: "Helvetica-Bold", borderTopWidth: 1, borderColor: "#98A2B3", paddingTop: 3, width: "100%", textAlign: "center" },
  signTitle: { color: "#475467", fontSize: 7.5 },

  footer: { position: "absolute", bottom: 16, left: 26, right: 26, flexDirection: "row", justifyContent: "space-between", color: "#98A2B3", fontSize: 7 },
});

// Column widths must total 100%. Photos get the most room because they are the
// evidence — the reason the customer reads this document at all.
const W = { no: "5%", part: "24%", before: "22%", after: "22%", notes: "27%" };

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
  company: { companyName: string };
  logo: PdfImageSrc | null;
  signature: PdfImageSrc | null;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
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
        <View style={s.titleRow}>
          {logo && <Image src={logo} style={s.logo} />}
          <Text style={s.title}>PROGRESS PENGERJAAN — {report.projectName.toUpperCase()}</Text>
        </View>

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
              <Text style={s.sectionText}>{g.name.toUpperCase()}</Text>
            </View>
            {g.items.map((item, i) => (
              <View key={`${gi}-${i}`} style={s.tr} wrap={false}>
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

        <View style={s.footer} fixed>
          <Text>{company.companyName} · {report.number}</Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
