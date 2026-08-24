"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { DocumentRowActions } from "@/components/documents/document-row-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import {
  generateProgressReportFromDocument,
  updateProgressReportItemAction,
} from "@/server/projects/progress-reports";
import { ChevronDown, ChevronRight, Sparkles, CheckCircle2, Circle, Eye, Download } from "lucide-react";

interface ProgressItem {
  id: string;
  sectionName: string | null;
  partName: string;
  quantity: string | null;
  notes: string | null;
  isDone: boolean;
}
interface GeneratedReport {
  id: string;
  summary: string | null;
  overallPercent: number | null;
  aiGenerated: boolean;
  items: ProgressItem[];
}
interface ProgressDoc {
  id: string;
  originalName: string;
  displayName: string;
  fileSize: number;
  reportDate: Date;
  dateFromFileName: boolean;
  uploadedBy: { name: string };
  progressReport: GeneratedReport | null;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Progress Report tab, v2: the real inspection/progress PDFs from the field
 * (same folder the Documents module and the bulk importer use), shown as a
 * timeline in the order the visits actually happened. Each file can be
 * expanded into an AI-generated checklist — extracted from that exact
 * document, not hand-typed — with checkboxes that actually persist when
 * clicked, fixing both original complaints in one move.
 */
export function ProgressReportDocumentsPanel({
  projectId,
  folderId,
  documents,
}: {
  projectId: string;
  folderId: string | null;
  documents: ProgressDoc[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [togglingItem, setTogglingItem] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function onGenerate(documentId: string, regenerate: boolean) {
    setGenerating((prev) => ({ ...prev, [documentId]: true }));
    const res = await generateProgressReportFromDocument(documentId, projectId);
    setGenerating((prev) => ({ ...prev, [documentId]: false }));
    if (res.ok) {
      toast({ title: regenerate ? "Checklist dibuat ulang" : "Checklist dibuat", variant: "success" });
      setExpanded((prev) => ({ ...prev, [documentId]: true }));
      router.refresh();
    } else {
      toast({ title: "AI tidak bisa membaca file ini", description: res.error, variant: "destructive" });
    }
  }

  async function onToggleItem(item: ProgressItem) {
    setTogglingItem(item.id);
    const fd = new FormData();
    fd.set("isDone", item.isDone ? "false" : "true");
    const res = await updateProgressReportItemAction(item.id, projectId, fd);
    setTogglingItem(null);
    if (res.ok) router.refresh();
    else toast({ title: "Tidak bisa mengubah status", description: res.error, variant: "destructive" });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Laporan progres lapangan — dokumen asli (PDF/foto) dari setiap kunjungan, diurutkan sesuai tanggal laporan
          dibuat. Klik &quot;Buat checklist (AI)&quot; pada tiap file untuk mendapatkan daftar cek yang bisa
          dicentang, diambil langsung dari isi dokumen.
        </p>
        {folderId && <UploadDialog folderId={folderId} />}
      </div>

      {!folderId && (
        <EmptyState title="Folder proyek belum tersedia" description="Struktur folder proyek ini belum lengkap — hubungi Admin/IT." />
      )}

      {folderId && documents.length === 0 && (
        <EmptyState
          title="Belum ada laporan progres"
          description='Upload PDF/foto laporan lapangan dari kunjungan pertama. Nama file yang diawali tanggal ("2026-08-10 - ...") akan diurutkan otomatis.'
        />
      )}

      {folderId && documents.length > 0 && (
        <div className="space-y-0">
          {documents.map((d) => {
            const isOpen = expanded[d.id] ?? false;
            const isGenerating = generating[d.id] ?? false;
            const report = d.progressReport;
            const doneCount = report ? report.items.filter((i) => i.isDone).length : 0;

            return (
              <div key={d.id} className="relative flex gap-3 border-l border-border pb-4 pl-4 last:pb-0">
                <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex-1 rounded-md border border-border">
                  <div
                    className="flex cursor-pointer items-start justify-between gap-3 p-3"
                    onClick={() => report && setExpanded((prev) => ({ ...prev, [d.id]: !isOpen }))}
                  >
                    <div className="flex items-start gap-2">
                      {report ? (
                        isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <span className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(d.reportDate)}
                          {!d.dateFromFileName && " · tanggal upload (nama file tidak diawali tanggal)"}
                        </p>
                        <p className="text-sm font-medium">{d.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          Diunggah oleh {d.uploadedBy.name} · {formatBytes(d.fileSize)}
                        </p>
                        {report?.summary && <p className="mt-1 text-xs text-muted-foreground">{report.summary}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {report && (
                        <Badge variant="outline">
                          {doneCount}/{report.items.length} selesai
                          {report.overallPercent != null && ` · ${report.overallPercent}%`}
                        </Badge>
                      )}
                      {report && (
                        <>
                          <a href={`/api/progress-reports/${report.id}/pdf?view=1`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost" title="Lihat / Cetak PDF">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                          <a href={`/api/progress-reports/${report.id}/pdf`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost" title="Download PDF">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        </>
                      )}
                      <Button size="sm" variant={report ? "outline" : "default"} disabled={isGenerating} onClick={() => onGenerate(d.id, Boolean(report))}>
                        <Sparkles className="h-3.5 w-3.5" />
                        {isGenerating ? "Membaca..." : report ? "Buat ulang (AI)" : "Buat checklist (AI)"}
                      </Button>
                      <DocumentRowActions id={d.id} folderId={folderId} />
                    </div>
                  </div>

                  {isOpen && report && (
                    <div className="space-y-2 border-t border-border p-3">
                      {report.items.length === 0 && (
                        <p className="text-sm text-muted-foreground">AI tidak menemukan rincian item pada dokumen ini.</p>
                      )}
                      {report.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={togglingItem === item.id}
                          onClick={() => onToggleItem(item)}
                          className="flex w-full items-start gap-2 rounded-md border border-border p-2 text-left hover:bg-accent"
                        >
                          {item.isDone ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div>
                            {item.sectionName && <p className="text-[11px] font-medium text-muted-foreground">{item.sectionName}</p>}
                            <p className="text-sm">
                              {item.partName}
                              {item.quantity && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({item.quantity})</span>}
                            </p>
                            {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
