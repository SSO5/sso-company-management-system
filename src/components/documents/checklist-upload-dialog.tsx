"use client";
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { uploadDocumentToFolder } from "@/server/documents/documents";
import type { ChecklistItem } from "@/server/document-checklist";
import { Upload, CheckCircle2, AlertCircle, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Upload by ANSWERING A QUESTION, not by navigating a folder tree.
 *
 * The generic upload dialog asks "which folder?", which only works if you
 * already know the ~23-folder layout. This one asks "dokumen apa ini?" and
 * derives the destination from the answer, because the slot a person can name
 * ("PO dari pelanggan") maps 1:1 to a routeKey the app already knows the
 * folder for.
 *
 * The filename is used as a first guess so the common case is one click. It is
 * only ever a PRE-SELECTION, never an automatic decision — a wrong guess that
 * files silently is far more expensive to undo than one the person corrects
 * before pressing Upload.
 */

// Deliberately ordered most-specific-first: an invoice filename usually also
// contains the customer's PO number, so "invoice" has to be tested before "po"
// or every invoice lands in the PO folder.
const FILENAME_HINTS: { routeKey: string; patterns: RegExp }[] = [
  { routeKey: "PROJECT/PROGRESS_REPORT", patterns: /progress|progres|laporan|inspection|report|dokumentasi|foto/i },
  { routeKey: "CLOSING/BAST", patterns: /bast|serah.?terima|berita.?acara/i },
  { routeKey: "CLOSING/FINAL_REPORT", patterns: /final.?report|laporan.?akhir/i },
  { routeKey: "FINANCE/PAYMENT", patterns: /bukti|transfer|pembayaran|payment|mutasi|rekening/i },
  { routeKey: "FINANCE/INVOICE", patterns: /invoice|inv[-._]|faktur|tagihan|kwitansi/i },
  { routeKey: "SALES/QUOTATION", patterns: /quot|penawaran|proposal|nego/i },
  { routeKey: "SALES/COSTING", patterns: /costing|hpp|margin|perhitungan.?biaya/i },
  { routeKey: "PROCUREMENT", patterns: /po[-\s]?\d*[-\s]?pro|vendor|supplier|pengadaan/i },
  { routeKey: "SALES/CONTRACT", patterns: /kontrak|contract|spk|perjanjian|agreement/i },
  { routeKey: "SALES/PO", patterns: /\bpo\b|purchase.?order|\b0\d{3}\b/i },
  { routeKey: "SALES/ENGINEERING", patterns: /drawing|dwg|gambar|assy|flange|engineering|desain/i },
  { routeKey: "SALES/DATA_INPUT", patterns: /boq|bill.?of.?quantity|spec|spesifikasi|datasheet|rfq|permintaan/i },
];

function guessRouteKey(fileName: string): string | null {
  for (const h of FILENAME_HINTS) if (h.patterns.test(fileName)) return h.routeKey;
  return null;
}

export function ChecklistUploadDialog({
  items,
  jobLabel,
  trigger,
  defaultRouteKey,
}: {
  items: ChecklistItem[];
  jobLabel: string;
  trigger?: React.ReactNode;
  defaultRouteKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [routeKey, setRouteKey] = useState<string | null>(defaultRouteKey ?? null);
  const [touched, setTouched] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  const uploadable = useMemo(() => items.filter((i) => i.folderId), [items]);
  const selected = uploadable.find((i) => i.routeKey === routeKey) ?? null;
  const guessed = file && !touched ? guessRouteKey(file.name) : null;

  function acceptFile(f: File | null) {
    setFile(f);
    if (!f) return;
    // Only pre-select if the person has not already chosen for themselves.
    if (!touched) {
      const g = guessRouteKey(f.name);
      if (g && uploadable.some((i) => i.routeKey === g)) setRouteKey(g);
    }
  }

  function reset() {
    setFile(null);
    setRouteKey(defaultRouteKey ?? null);
    setTouched(false);
    setPending(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !selected?.folderId) return;
    setPending(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("description", (e.currentTarget.elements.namedItem("description") as HTMLInputElement)?.value ?? "");
    const res = await uploadDocumentToFolder(selected.folderId, fd);
    setPending(false);
    if (res.ok) {
      toast({ title: `Tersimpan di "${selected.label}"`, variant: "success" });
      setOpen(false);
      reset();
      router.refresh();
    } else {
      toast({ title: "Gagal mengunggah", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger ?? (
          <Button size="sm"><Upload className="h-3.5 w-3.5" /> Unggah dokumen</Button>
        )}
      </span>
      <Dialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}
        title="Unggah dokumen"
        description={`${jobLabel} — pilih jenis dokumennya, folder tujuan ditentukan otomatis.`}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0] ?? null); }}
            onClick={() => fileInput.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            )}
          >
            <FileUp className="h-5 w-5 text-muted-foreground" />
            {file ? (
              <>
                <span className="font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB — klik untuk ganti</span>
              </>
            ) : (
              <>
                <span className="font-medium">Tarik file ke sini, atau klik untuk memilih</span>
                <span className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint, gambar, ZIP — maksimal 50MB</span>
              </>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.zip,.txt"
            onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
          />

          <div className="space-y-1.5">
            <Label>Ini dokumen apa?</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {uploadable.map((item) => {
                const active = item.routeKey === routeKey;
                const isGuess = guessed === item.routeKey && active;
                return (
                  <button
                    type="button"
                    key={item.routeKey}
                    onClick={() => { setRouteKey(item.routeKey); setTouched(true); }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      active ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                    )}
                  >
                    {item.count > 0
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      : <AlertCircle className={cn("mt-0.5 h-4 w-4 shrink-0", item.required ? "text-destructive" : "text-muted-foreground")} />}
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-medium">
                        {item.label}
                        {item.required && item.count === 0 && <span className="text-[10px] font-normal text-destructive">wajib</span>}
                        {isGuess && <span className="text-[10px] font-normal text-primary">disarankan dari nama file</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">{item.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Keterangan (opsional)</Label>
            <Input id="description" name="description" placeholder="mis. revisi 2, sudah ditandatangani pelanggan" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending || !file || !selected}>
              {pending ? "Mengunggah..." : "Unggah"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
