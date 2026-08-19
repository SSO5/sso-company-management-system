"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { activateContractAction } from "@/server/sales/purchase-orders";
import { FileCheck } from "lucide-react";

/**
 * The only path from Draft to Active — requires uploading the real signed
 * contract document in the same step (spec: no "Active" without evidence).
 */
export function ActivateContractDialog({ contractId, contractNumber }: { contractId: string; contractNumber: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await activateContractAction(contractId, fd);
    setPending(false);
    if (res.ok) {
      toast({ title: `${contractNumber} diaktifkan`, variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Tidak bisa mengaktifkan kontrak", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileCheck className="h-3.5 w-3.5" /> Aktifkan
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Aktifkan Kontrak ${contractNumber}`}
        description="Upload dokumen kontrak yang sudah ditandatangani kedua pihak — status baru berubah jadi Active setelah file ini tersimpan."
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Dokumen Kontrak (sudah ditandatangani) <span className="text-destructive">*</span></Label>
            <Input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Aktifkan Kontrak"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
