/**
 * The AI upload classifier's menu of valid destinations (Aug 2026) — every
 * leaf folder in PROJECT_FOLDER_TEMPLATE (see lib/workflows/folders.ts),
 * with a plain-language description of what belongs there. Kept as a
 * hand-written parallel list (not derived from the template) because the
 * template only carries name/routeKey, not "what kind of document goes
 * here" — the thing Claude actually needs to classify against. If
 * PROJECT_FOLDER_TEMPLATE changes, update this too.
 *
 * Deliberately its own file with NO Node/Prisma dependencies (unlike
 * folders.ts, which imports "crypto" for createTree) — the confirm-step
 * dropdown in the AI Smart Upload dialog is a client component and needs to
 * import this list directly without pulling a server-only module into the
 * browser bundle.
 */
export interface DocumentFolderOption {
  routeKey: string;
  label: string; // shown in the confirm-step dropdown, matches the real folder path
  hint: string; // what kind of document typically belongs here — sent to the AI classifier
}

export const DOCUMENT_FOLDER_OPTIONS: DocumentFolderOption[] = [
  { routeKey: "SALES/DATA_INPUT", label: "01 Sales / 1. Data Input", hint: "Permintaan awal dari customer — RFQ, spesifikasi, data teknis mentah sebelum ada desain/harga." },
  { routeKey: "SALES/ENGINEERING", label: "01 Sales / 2. Engineering Concept", hint: "Konsep desain/teknis, gambar/drawing, perhitungan engineering." },
  { routeKey: "SALES/COSTING", label: "01 Sales / 3. Costing", hint: "Dokumen pendukung perhitungan biaya/RAB (bukan Costing Sheet itu sendiri — itu record terpisah)." },
  { routeKey: "SALES/QUOTATION", label: "01 Sales / 4. Quotation", hint: "Penawaran harga yang dikirim ke customer." },
  { routeKey: "SALES/PO", label: "01 Sales / 5. PO", hint: "Purchase Order ASLI dari customer (dokumen inbound, bukan yang dibuat SSO)." },
  { routeKey: "SALES/CONTRACT", label: "01 Sales / 6. Dokumen Kontrak", hint: "Kontrak kerja/perjanjian yang ditandatangani kedua pihak." },
  { routeKey: "FINANCE/INVOICE", label: "02 Finance / Invoice", hint: "Invoice/tagihan ke customer." },
  { routeKey: "FINANCE/PAYMENT", label: "02 Finance / Payment", hint: "Bukti transfer/pembayaran dari customer." },
  { routeKey: "FINANCE/FINANCIAL_DOCUMENTS", label: "02 Finance / Financial Documents", hint: "Dokumen keuangan lain — bukti pengeluaran, faktur pajak, dsb." },
  { routeKey: "PROJECT/PROJECT_PLAN", label: "03 Project / Project Plan", hint: "Rencana kerja/eksekusi project." },
  { routeKey: "PROJECT/TIMELINE", label: "03 Project / Timeline", hint: "Jadwal/timeline pengerjaan." },
  { routeKey: "PROJECT/PROGRESS_REPORT", label: "03 Project / Progress Report", hint: "Laporan progres lapangan — hasil kunjungan/inspeksi, foto kemajuan pekerjaan." },
  { routeKey: "PROJECT/MEETING", label: "03 Project / Meeting", hint: "Notulen rapat, berita acara meeting (BUKAN berita acara serah terima — itu BAST)." },
  { routeKey: "PROJECT/DELIVERABLES", label: "03 Project / Deliverables", hint: "Hasil akhir pekerjaan yang diserahkan — laporan teknis, manual, dokumen hasil." },
  { routeKey: "PROCUREMENT", label: "04 Procurement", hint: "PO ke vendor/supplier, dokumen pembelian material/jasa dari SSO ke pihak ketiga." },
  { routeKey: "DOCUMENTATION", label: "05 Documentation", hint: "Foto/video dokumentasi lapangan yang tidak spesifik ke satu laporan progres — evidence umum." },
  { routeKey: "CLOSING/BAST", label: "06 Closing / BAST", hint: "Berita Acara Serah Terima." },
  { routeKey: "CLOSING/FINAL_REPORT", label: "06 Closing / Final Report", hint: "Laporan akhir project secara keseluruhan." },
  { routeKey: "CLOSING/PROJECT_CLOSURE", label: "06 Closing / Project Closure", hint: "Dokumen administratif penutupan project." },
];
