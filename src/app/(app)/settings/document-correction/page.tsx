import { requireUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import {
  listQuotationsForCorrection,
  listVendorPOsForCorrection,
  listInvoicesForCorrection,
  listProgressReportsForCorrection,
  listFoldersForCorrection,
  listWonLostOpportunitiesForCorrection,
} from "@/server/corrections";
import { DocumentCorrectionPanel } from "@/components/settings/document-correction-panel";

/**
 * "Koreksi Dokumen" — the IT/Admin-only tool for fixing what the automated
 * import/numbering pipeline got wrong: a duplicate or reversed document
 * number, a misfiled upload, a mis-OCR'd report title. Every other edit
 * screen in the app locks a record the moment it's submitted; this is the
 * one explicit, logged exception (see lib/workflows/corrections.ts).
 */
export default async function DocumentCorrectionPage() {
  const actor = await requireUser();
  if (actor.role !== "ADMIN" && actor.role !== "IT") redirect("/dashboard");

  const [quotations, vendorPOs, invoices, progressReports, folders, wonLostOpportunities] = await Promise.all([
    listQuotationsForCorrection(),
    listVendorPOsForCorrection(),
    listInvoicesForCorrection(),
    listProgressReportsForCorrection(),
    listFoldersForCorrection(),
    listWonLostOpportunitiesForCorrection(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Koreksi Dokumen</h1>
        <p className="text-sm text-muted-foreground">
          Untuk memperbaiki nomor, nama, atau lokasi dokumen setelah otomatisasi salah membaca uploadan —
          termasuk dokumen yang sudah terkirim/disetujui dan biasanya terkunci — atau membatalkan status
          Won/Lost sebuah deal yang keliru ter-set. Setiap koreksi wajib diberi alasan dan tercatat di Log
          Aktivitas.
        </p>
      </div>
      <DocumentCorrectionPanel
        quotations={JSON.parse(JSON.stringify(quotations))}
        vendorPOs={JSON.parse(JSON.stringify(vendorPOs))}
        invoices={JSON.parse(JSON.stringify(invoices))}
        progressReports={JSON.parse(JSON.stringify(progressReports))}
        folders={folders}
        wonLostOpportunities={wonLostOpportunities}
      />
    </div>
  );
}
