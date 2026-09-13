import React from "react";
import { writeFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import { ProgressReportPdfDocument } from "../src/lib/pdf/progress-report-document";

async function main() {
  const buffer = await renderToBuffer(<ProgressReportPdfDocument
    report={{ number: "QA-NOT-FOR-SENDING", draft: true, inspectionDate: new Date("2026-09-07T05:00:00Z"), location: null, summary: null, overallPercent: null,
      preparedByName: "Pemeriksaan aplikasi", preparedByTitle: null, projectNumber: "QA", projectName: "Validasi tampilan laporan", customerName: "Contoh pengujian", items: [
        { sectionName: "CV 6806", partName: "Timken 655 / 652A", quantity: "2 pc", notes: "Rencana datang 31/8/26 DALAM PROSES", isDone: false, photoBefore: null, photoAfter: null },
        { sectionName: "CV 6806", partName: "Seal SKF 44913", quantity: "4 pc", notes: "Barang sudah datang DALAM PROSES", isDone: false, photoBefore: null, photoAfter: null },
      ] }} company={{ companyName: "SSO - PENGUJIAN", address: null, addressLine2: null, city: null, province: null, phone: null }} logo={null} signature={null}/>
  );
  await writeFile("tmp/weekly-pdf-qa.pdf", buffer);
  console.log("PDF QA generated; not a business report.");
}
main().catch(() => { console.error("PDF QA failed"); process.exitCode = 1; });
