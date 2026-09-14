"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { uploadAndExtractPurchaseOrder, createPurchaseOrder } from "@/server/sales/purchase-orders";
import { Sparkles, Upload, TriangleAlert } from "lucide-react";
import type { ExtractedPurchaseOrder } from "@/lib/ai/extract-purchase-order";

type Step = "upload" | "confirm";

/**
 * "Titik masuk pertama" — upload the real customer PO once, let Claude read
 * it, then show the suggested number/date/value for a human to check and
 * confirm before a PurchaseOrder record is actually created. The file is
 * saved as a Document either way, even if extraction fails or is skipped —
 * uploading the source document is never blocked on the AI step working.
 *
 * Also runs pre-Won, from the Quotation detail page (pass `quotationId`
 * instead of `projectId`) — that's what lets markQuotationWon's "real PO
 * file must be on file" gate actually be satisfiable: a Project doesn't
 * exist yet at that point, so the file has to land in the Opportunity's own
 * "5. PO" folder and get tagged onto the PurchaseOrder via `documentId`
 * instead (see createPurchaseOrder in server/sales/purchase-orders.ts).
 */
export function PoExtractUploadDialog({
  folderId,
  projectId,
  quotationId,
  customerId,
  buttonLabel,
}: {
  folderId: string;
  customerId: string;
  projectId?: string;
  quotationId?: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [pending, setPending] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedPurchaseOrder | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [autoRead, setAutoRead] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  function reset() {
    setStep("upload");
    setDocumentId(null);
    setExtracted(null);
    setExtractionError(null);
    setFileName("");
    setAutoRead(false);
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("skipExtraction", autoRead ? "false" : "true");
    const file = fd.get("file") as File | null;
    setFileName(file?.name ?? "");
    const res = await uploadAndExtractPurchaseOrder({ folderId, projectId, customerId }, fd);
    setPending(false);
    if (!res.ok) { toast({ title: "Upload gagal", description: res.error, variant: "destructive" }); return; }
    toast({ title: "File PO tersimpan", variant: "success" });
    setDocumentId(res.data.documentId);
    setExtracted(res.data.extracted);
    setExtractionError(res.data.extractionError);
    setStep("confirm");
    router.refresh(); // so the file already shows up in the list even if the user closes here
  }

  async function onConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await createPurchaseOrder({
      customerId,
      projectId,
      quotationId,
      documentId,
      number: fd.get("number"),
      poDate: fd.get("poDate"),
      poValue: fd.get("poValue"),
      paymentTerms: fd.get("paymentTerms") || null,
      deliveryTerms: fd.get("deliveryTerms") || null,
      estimatedDeliveryDate: fd.get("estimatedDeliveryDate") || null,
      status: "VERIFIED",
    });
    setPending(false);
    if (res.ok) {
      toast({ title: "Purchase order tercatat", variant: "success" });
      setOpen(false);
      reset();
      router.refresh();
    } else {
      toast({ title: "Tidak bisa menyimpan PO", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-3.5 w-3.5" /> {buttonLabel ?? "Unggah PO customer"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
        title={step === "upload" ? "Unggah PO asli dari customer" : "Periksa data PO"}
        description={
          step === "upload"
            ? "File tetap disimpan dalam format customer. Isi data utama secara manual atau aktifkan pembacaan otomatis bila diperlukan."
            : `Dari file "${fileName}". Periksa data utama sebelum mencatat PO.`
        }
      >
        {step === "upload" && (
          <form onSubmit={onUpload} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="po-file">File PO</Label>
              <Input id="po-file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" />
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={autoRead} onChange={(event) => setAutoRead(event.target.checked)} />
              <span>
                <span className="flex items-center gap-1 font-medium"><Sparkles className="h-3.5 w-3.5" /> Coba isi data otomatis</span>
                <span className="block text-xs text-muted-foreground">Opsional. Tanpa fitur ini, file langsung tersimpan dan form tetap dapat diisi biasa.</span>
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" disabled={pending}>
                <Upload className="h-3.5 w-3.5" /> {pending ? (autoRead ? "Mengunggah dan membaca…" : "Mengunggah…") : "Lanjut"}
              </Button>
            </div>
          </form>
        )}

        {step === "confirm" && (
          <form onSubmit={onConfirm} className="space-y-3">
            {extractionError && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{extractionError} File tetap tersimpan; isi data utama di bawah.</span>
              </div>
            )}
            {extracted?.confidence === "low" && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>AI kurang yakin dengan hasil baca dokumen ini{extracted.notes ? ` — ${extracted.notes}` : ""}. Periksa ulang angkanya.</span>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="po-number">Nomor PO customer</Label>
              <Input id="po-number" name="number" required defaultValue={extracted?.number ?? ""} placeholder="EPC-L/2026-0450" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="po-date">Tanggal PO</Label>
                <Input id="po-date" name="poDate" type="date" required defaultValue={extracted?.poDate ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="po-value">Nilai PO (IDR)</Label>
                <Input id="po-value" name="poValue" type="number" min={0} required defaultValue={extracted?.poValue ?? ""} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="po-payment-terms">Syarat pembayaran <span className="font-normal text-muted-foreground">(opsional)</span></Label>
              <Input id="po-payment-terms" name="paymentTerms" defaultValue={extracted?.paymentTerms ?? ""} placeholder="40% DP, 50% Before Delivered, 10% Retention" />
              <p className="text-[11px] text-muted-foreground">Dipakai untuk menghitung sisa penagihan di tab Documents.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="po-delivery-terms">Syarat penyerahan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
              <Input id="po-delivery-terms" name="deliveryTerms" defaultValue={extracted?.deliveryTerms ?? ""} placeholder="ETA MAX 6 Weeks ARO" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="po-est-delivery">Perkiraan tanggal selesai/kirim <span className="font-normal text-muted-foreground">(opsional)</span></Label>
              <Input id="po-est-delivery" name="estimatedDeliveryDate" type="date" defaultValue={extracted?.estimatedDeliveryDate ?? ""} />
              <p className="text-[11px] text-muted-foreground">
                {extracted?.estimatedDeliveryDate
                  ? "Dihitung dari syarat penyerahan dan tanggal PO; periksa kembali sebelum menyimpan."
                  : "Isi jika tanggalnya sudah diketahui."}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Tutup</Button>
              <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan sebagai PO"}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
