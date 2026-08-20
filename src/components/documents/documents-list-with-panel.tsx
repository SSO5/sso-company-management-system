"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { trashDocument } from "@/server/documents/documents";
import { formatDateTime, cn } from "@/lib/utils";
import { FileText, Eye, Download, Trash2, X } from "lucide-react";

interface DocumentRow {
  id: string; originalName: string; fileSize: number; uploadedAt: Date;
  uploadedBy: { name: string }; description: string | null;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Documents list + right-side detail panel: clicking a row opens its
 * details (preview, uploader, date, quick actions) inline instead of the
 * row's tiny icon-only actions being the only way to act on a file. Split
 * out of the (mostly server-rendered) folder page because "which row is
 * selected" is UI state that has to live on the client.
 */
export function DocumentsListWithPanel({ documents, folderId }: { documents: DocumentRow[]; folderId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const selected = documents.find((d) => d.id === selectedId) ?? null;

  async function onDelete(id: string) {
    setPending(true);
    const res = await trashDocument(id, folderId);
    setPending(false);
    if (res.ok) { setSelectedId(null); router.refresh(); }
    else toast({ title: "Tidak bisa menghapus", description: res.error, variant: "destructive" });
  }

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <Table>
          <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Size</TableHead><TableHead>Uploaded By</TableHead><TableHead>Uploaded At</TableHead></TableRow></TableHeader>
          <TableBody>
            {documents.map((d) => (
              <TableRow
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={cn("cursor-pointer", selectedId === d.id && "bg-primary/5")}
              >
                <TableCell className="flex items-center gap-2 font-medium">
                  <FileText className={cn("h-4 w-4 shrink-0", selectedId === d.id ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn(selectedId === d.id && "text-primary")}>{d.originalName}</span>
                </TableCell>
                <TableCell>{formatBytes(d.fileSize)}</TableCell>
                <TableCell>{d.uploadedBy.name}</TableCell>
                <TableCell>{formatDateTime(d.uploadedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <div className="w-80 shrink-0 rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Detail Dokumen</span>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 flex h-32 flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <span className="text-[11px] text-muted-foreground">Preview belum tersedia — gunakan Lihat</span>
          </div>

          <p className="break-words text-sm font-semibold">{selected.originalName}</p>
          <p className="mb-4 text-xs text-muted-foreground">{formatBytes(selected.fileSize)}</p>

          <div className="mb-4 space-y-2 border-y border-border py-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Diupload oleh</span><span className="font-medium">{selected.uploadedBy.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tanggal upload</span><span className="font-medium">{formatDateTime(selected.uploadedAt)}</span></div>
            {selected.description && <p className="text-muted-foreground">{selected.description}</p>}
          </div>

          <div className="flex gap-2">
            <a href={`/api/files/${selected.id}?view=1`} target="_blank" rel="noreferrer" className="flex-1">
              <Button className="w-full"><Eye className="h-3.5 w-3.5" /> Lihat</Button>
            </a>
            <a href={`/api/files/${selected.id}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="icon"><Download className="h-3.5 w-3.5" /></Button>
            </a>
            <Button variant="outline" size="icon" disabled={pending} onClick={() => onDelete(selected.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
