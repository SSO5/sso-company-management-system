import { EmptyState } from "@/components/ui/empty-state";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { DocumentRowActions } from "@/components/documents/document-row-actions";
import { formatDate } from "@/lib/utils";

interface ProgressDoc {
  id: string;
  originalName: string;
  displayName: string;
  fileSize: number;
  reportDate: Date;
  dateFromFileName: boolean;
  uploadedBy: { name: string };
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Progress Report tab, v2: the real inspection/progress PDFs from the field
 * (same folder the Documents module and the bulk importer use), shown as a
 * timeline in the order the visits actually happened — not a hand-typed
 * checklist that has to be trusted to match a PDF nobody in the app can see.
 *
 * Ordering comes from the "YYYY-MM-DD - <title>.pdf" prefix SSO's own field
 * team already uses when naming these files. Keep naming files that way and
 * new uploads slot into the right place automatically.
 */
export function ProgressReportDocumentsPanel({
  folderId,
  documents,
}: {
  folderId: string | null;
  documents: ProgressDoc[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Laporan progres lapangan — dokumen asli (PDF/foto) dari setiap kunjungan, diurutkan sesuai tanggal laporan
          dibuat. Beri nama file diawali tanggal, mis. &quot;2026-08-10 - Laporan Progres Gearbox.pdf&quot;, supaya
          urutannya otomatis benar.
        </p>
        {folderId && <UploadDialog folderId={folderId} />}
      </div>

      {!folderId && (
        <EmptyState
          title="Folder proyek belum tersedia"
          description="Struktur folder proyek ini belum lengkap — hubungi Admin/IT."
        />
      )}

      {folderId && documents.length === 0 && (
        <EmptyState
          title="Belum ada laporan progres"
          description='Upload PDF/foto laporan lapangan dari kunjungan pertama. Nama file yang diawali tanggal ("2026-08-10 - ...") akan diurutkan otomatis.'
        />
      )}

      {folderId && documents.length > 0 && (
        <div className="space-y-0">
          {documents.map((d) => (
            <div key={d.id} className="relative flex gap-3 border-l border-border pb-4 pl-4 last:pb-0">
              <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="flex flex-1 items-start justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(d.reportDate)}
                    {!d.dateFromFileName && " · tanggal upload (nama file tidak diawali tanggal)"}
                  </p>
                  <p className="text-sm font-medium">{d.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    Diunggah oleh {d.uploadedBy.name} · {formatBytes(d.fileSize)}
                  </p>
                </div>
                <DocumentRowActions id={d.id} folderId={folderId} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
