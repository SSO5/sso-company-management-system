"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  submitVendorPOAction, approveVendorPOAction, rejectVendorPOAction, markVendorPOSentAction,
} from "@/server/sales/vendor-purchase-orders";
import type { VendorPurchaseOrderStatus, UserRole } from "@prisma/client";

export function VendorPOActions({ id, status, role }: { id: string; status: VendorPurchaseOrderStatus; role: UserRole }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

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

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen} title="Tolak PO vendor" description="Alasan disimpan dalam riwayat pemeriksaan.">
        <div className="space-y-3">
          <Textarea placeholder="Alasan penolakan" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Batal</Button>
            <Button variant="destructive" disabled={!reason || pending} onClick={() => { setRejectOpen(false); run(() => rejectVendorPOAction(id, reason)); }}>Tolak PO</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
