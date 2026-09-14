"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  submitVendorPOAction, approveVendorPOAction, rejectVendorPOAction, markVendorPOSentAction, confirmVendorPOAction,
} from "@/server/sales/vendor-purchase-orders";
import type { VendorPurchaseOrderStatus, UserRole } from "@prisma/client";

export function VendorPOActions({ id, status, role }: { id: string; status: VendorPurchaseOrderStatus; role: UserRole }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (res.ok) {
      router.refresh();
    } else {
      toast({ title: "Tindakan belum dapat diproses", description: res.error, variant: "destructive" });
    }
  }

  const isAdmin = role === "ADMIN";
  // IT gets the same edit surface as Sales (not Approve/Reject — that stays
  // Admin-only) so a still-DRAFT vendor PO can be corrected directly; see
  // lib/permissions.ts MATRIX.IT.
  const canEditSales = role === "ADMIN" || role === "SALES" || role === "IT";

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && canEditSales && (
        <Button size="sm" disabled={pending} onClick={() => run(() => submitVendorPOAction(id))}>Ajukan persetujuan</Button>
      )}
      {status === "SUBMITTED" && isAdmin && (
        <>
          <Button size="sm" disabled={pending} onClick={() => run(() => approveVendorPOAction(id))}>Setujui</Button>
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => setRejectOpen(true)}>Tolak</Button>
        </>
      )}
      {status === "APPROVED" && canEditSales && (
        <Button size="sm" disabled={pending} onClick={() => run(() => markVendorPOSentAction(id))}>Tandai dikirim ke vendor</Button>
      )}
      {status === "SENT" && canEditSales && (
        <Button size="sm" disabled={pending} onClick={() => setConfirmOpen(true)}>Catat konfirmasi vendor</Button>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen} title="Tolak PO vendor" description="Alasan disimpan dalam riwayat pemeriksaan.">
        <div className="space-y-3">
          <Textarea placeholder="Alasan penolakan" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Batal</Button>
            <Button variant="destructive" disabled={!reason || pending} onClick={() => { setRejectOpen(false); run(() => rejectVendorPOAction(id, reason)); }}>Tolak PO</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Konfirmasi PO dari vendor" description="Unggah salinan PO yang sudah ditandatangani, dibalas, atau disetujui vendor. Bukti ini menjadi dasar status Dikonfirmasi.">
        <form className="space-y-3" onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          const res = await confirmVendorPOAction(id, new FormData(event.currentTarget));
          setPending(false);
          if (res.ok) {
            setConfirmOpen(false);
            toast({ title: "Konfirmasi vendor tercatat", variant: "success" });
            router.refresh();
          } else {
            toast({ title: "Konfirmasi belum dapat disimpan", description: res.error, variant: "destructive" });
          }
        }}>
          <div className="space-y-1">
            <Label htmlFor="vendor-confirmation-file">Bukti konfirmasi</Label>
            <Input id="vendor-confirmation-file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan konfirmasi"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
