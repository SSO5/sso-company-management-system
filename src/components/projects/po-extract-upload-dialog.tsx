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
 */
export function PoExtractUploadDialog({
  folderId,
  projectId,
  customerId,
}: {
  folderId: string;
  projectId: string;
  customerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [pending, setPending] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedPurchaseOrder | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  function reset() {
    setStep("upload");
    setExtracted(null);
    setExtractionError(null);
    setFileName("");
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file") as File | null;
    setFileName(file?.name ?? "");
    const res = await uploadAndExtractPurchaseOrder({ folderId, projectId, customerId }, fd);
    setPending(false);
    if (!res.ok) { toast({ title: "Upload gagal", description: res.error, variant: "destructive" }); return; }
    toast({ title: "File PO tersimpan", variant: "success" });
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
        <Sparkles className="h-3.5 w-3.5" /> Upload PO (AI-assisted)
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
        title={step === "upload" ? "Upload Customer PO" : "Konfirmasi Data PO"}
        description={
          step === "upload"
            ? "PDF atau foto PO asli — AI akan membaca dan mengisi form berikutnya, tetap perlu kamu periksa."
            : `Dari file "${fileName}". Periksa/lengkapi sebelum disimpan sebagai record PO resmi.`
        }
      >
        {step === "upload" && (
          <form onSubmit={onUpload} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="po-file">File PO</Label>
              <Input id="po-file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" disabled={pending}>
                <Upload className="h-3.5 w-3.5" /> {pending ? "Mengunggah & membaca..." : "Upload"}
              </Button>
            </div>
          </form>
        )}

        {step === "confirm" && (
          <form onSubmit={onConfirm} className="space-y-3">
            {extractionError && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{extractionError} File tetap tersimpan di Documents — isi field di bawah secara manual.</span>
              </div>
            )}
            {extracted?.confidence === "low" && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>AI kurang yakin dengan hasil baca dokumen ini{extracted.notes ? ` — ${extracted.notes}` : ""}. Periksa ulang angkanya.</span>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="po-number">PO Number (dari customer)</Label>
              <Input id="po-number" name="number" required defaultValue={extracted?.number ?? ""} placeholder="EPC-L/2026-0450" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="po-date">PO Date</Label>
                <Input id="po-date" name="poDate" type="date" required defaultValue={extracted?.poDate ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="po-value">PO Value (IDR)</Label>
                <Input id="po-value" name="poValue" type="number" min={0} required defaultValue={extracted?.poValue ?? ""} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="po-payment-terms">Term of Payment (opsional)</Label>
              <Input id="po-payment-terms" name="paymentTerms" defaultValue={extracted?.paymentTerms ?? ""} placeholder="40% DP, 50% Before Delivered, 10% Retention" />
              <p className="text-[11px] text-muted-foreground">Dipakai untuk menghitung sisa penagihan di tab Documents.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="po-delivery-terms">Term of Delivery (opsional)</Label>
              <Input id="po-delivery-terms" name="deliveryTerms" defaultValue={extracted?.deliveryTerms ?? ""} placeholder="ETA MAX 6 Weeks ARO" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="po-est-delivery">Perkiraan Tanggal Selesai/Kirim (opsional)</Label>
              <Input id="po-est-delivery" name="estimatedDeliveryDate" type="date" defaultValue={extracted?.estimatedDeliveryDate ?? ""} />
              <p className="text-[11px] text-muted-foreground">
                {extracted?.estimatedDeliveryDate
                  ? "Dihitung AI dari Term of Delivery + tanggal PO — periksa ulang, ini perkiraan."
                  : "AI tidak bisa menghitung tanggal dari Term of Delivery — isi manual kalau tahu."}
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
