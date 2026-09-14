"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  submitQuotationAction, approveQuotationAction, rejectQuotationAction,
  sendQuotationAction, markWonAction, markLostAction, reviseQuotationAction,
  deleteQuotationAction,
} from "@/server/sales/quotations";
import type { QuotationStatus, UserRole } from "@prisma/client";

export function QuotationActions({
  id,
  status,
  role,
  projectManagers,
  opportunityId,
  hasUploadedPo,
}: {
  id: string;
  status: QuotationStatus;
  role: UserRole;
  projectManagers: { id: string; name: string }[];
  opportunityId?: string | null;
  // Gate for "Mark Won" (spec: a real customer PO file must already be
  // uploaded — see hasUploadedCustomerPoDocument in lib/workflows/quotation.ts).
  // Server-side re-checked regardless; this only lets the button reflect it
  // up front instead of failing after the confirm dialog.
  hasUploadedPo: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pmId, setPmId] = useState("");

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
  // Admin-only) so a still-DRAFT quotation can be corrected directly; see
  // lib/permissions.ts MATRIX.IT.
  const canEditSales = role === "ADMIN" || role === "SALES" || role === "IT";
  const isRevisable = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "SENT"].includes(status);

  async function reviseAndEdit() {
    setPending(true);
    const res = await reviseQuotationAction(id);
    setPending(false);
    if (res.ok) {
      toast({ title: "Revisi penawaran baru berhasil dibuat", variant: "success" });
      router.push(`/sales/quotations/${id}/edit`);
    } else {
      toast({ title: "Revisi belum dapat dibuat", description: res.error, variant: "destructive" });
    }
  }

  async function confirmDelete() {
    setDeleteOpen(false);
    setPending(true);
    const res = await deleteQuotationAction(id);
    setPending(false);
    if (res.ok) {
      toast({ title: "Quotation dihapus", variant: "success" });
      router.push(opportunityId ? `/sales/opportunities/${opportunityId}` : "/sales/quotations");
    } else {
      toast({ title: "Gagal menghapus", description: res.error, variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && canEditSales && (
        <Button disabled={pending} onClick={() => run(() => submitQuotationAction(id))}>Ajukan persetujuan</Button>
      )}
      {status === "DRAFT" && canEditSales && (
        <Button disabled={pending} variant="destructive" onClick={() => setDeleteOpen(true)}>Hapus</Button>
      )}
      {isRevisable && canEditSales && (
        <Button disabled={pending} variant="outline" onClick={reviseAndEdit}>Buat Revisi (R+1)</Button>
      )}
      {["SUBMITTED", "UNDER_REVIEW"].includes(status) && isAdmin && (
        <>
          <Button disabled={pending} onClick={() => run(() => approveQuotationAction(id))}>Setujui</Button>
          <Button disabled={pending} variant="destructive" onClick={() => setRejectOpen(true)}>Tolak</Button>
        </>
      )}
      {status === "APPROVED" && canEditSales && (
        <Button disabled={pending} onClick={() => run(() => sendQuotationAction(id))}>Tandai dikirim ke pelanggan</Button>
      )}
      {["SENT", "APPROVED"].includes(status) && canEditSales && (
        <>
          <Button
            disabled={pending || !hasUploadedPo}
            title={hasUploadedPo ? undefined : "Unggah PO asli pelanggan terlebih dahulu sebelum menandai penawaran dimenangkan."}
            onClick={() => setWonOpen(true)}
          >
            Tandai dimenangkan
          </Button>
          <Button disabled={pending} variant="outline" onClick={() => setLostOpen(true)}>Tidak berlanjut</Button>
        </>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen} title="Tolak penawaran" description="Alasan disimpan dalam riwayat pemeriksaan.">
        <div className="space-y-3">
          <Textarea placeholder="Alasan penolakan" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Batal</Button>
            <Button variant="destructive" disabled={!reason || pending} onClick={() => { setRejectOpen(false); run(() => rejectQuotationAction(id, reason)); }}>Tolak penawaran</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Hapus Quotation Draft" description="Nomor yang sudah terlanjur terbit tidak akan dipakai ulang — tindakan ini hanya untuk draft yang salah input dan belum pernah dikirim/diajukan.">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Yakin hapus quotation ini? Tindakan ini tidak bisa dibatalkan dari layar ini.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Batal</Button>
            <Button variant="destructive" disabled={pending} onClick={confirmDelete}>Hapus Permanen</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={lostOpen} onOpenChange={setLostOpen} title="Tandai tidak berlanjut" description="Catat alasannya agar dapat dipelajari dalam laporan penjualan.">
        <div className="space-y-3">
          <Textarea placeholder="Contoh: harga, perubahan anggaran, atau kebutuhan dibatalkan" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLostOpen(false)}>Batal</Button>
            <Button variant="destructive" disabled={!reason || pending} onClick={() => { setLostOpen(false); run(() => markLostAction(id, reason)); }}>Simpan alasan</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={wonOpen} onOpenChange={setWonOpen} title="Konfirmasi penawaran dimenangkan" description="Sistem akan membuat proyek dan folder kerja otomatis, lalu memberi tahu Finance dan Manajer Proyek.">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Manajer proyek <span className="font-normal text-muted-foreground">(opsional)</span></Label>
            <Select value={pmId} onChange={(e) => setPmId(e.target.value)}>
              <option value="">Belum ditentukan — beri tahu semua Manajer Proyek</option>
              {projectManagers.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWonOpen(false)}>Batal</Button>
            <Button disabled={pending} onClick={() => {
              setWonOpen(false);
              run(async () => {
                const res = await markWonAction(id, pmId || undefined);
                if (res.ok) {
                  toast({ title: "Proyek berhasil dibuat", description: "Ruang proyek dan dokumen pendukung sudah disiapkan otomatis.", variant: "success" });
                  router.push(`/projects/${res.data.projectId}`);
                }
                return res;
              });
            }}>Konfirmasi dan buat proyek</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
