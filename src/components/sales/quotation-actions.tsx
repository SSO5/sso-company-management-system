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
      toast({ title: "Action failed", description: res.error, variant: "destructive" });
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
      toast({ title: "Quotation reopened as a new revision", variant: "success" });
      router.push(`/sales/quotations/${id}/edit`);
    } else {
      toast({ title: "Unable to revise", description: res.error, variant: "destructive" });
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
        <Button disabled={pending} onClick={() => run(() => submitQuotationAction(id))}>Submit for Approval</Button>
      )}
      {status === "DRAFT" && canEditSales && (
        <Button disabled={pending} variant="destructive" onClick={() => setDeleteOpen(true)}>Hapus</Button>
      )}
      {isRevisable && canEditSales && (
        <Button disabled={pending} variant="outline" onClick={reviseAndEdit}>Buat Revisi (R+1)</Button>
      )}
      {["SUBMITTED", "UNDER_REVIEW"].includes(status) && isAdmin && (
        <>
          <Button disabled={pending} onClick={() => run(() => approveQuotationAction(id))}>Approve</Button>
          <Button disabled={pending} variant="destructive" onClick={() => setRejectOpen(true)}>Reject</Button>
        </>
      )}
      {status === "APPROVED" && canEditSales && (
        <Button disabled={pending} onClick={() => run(() => sendQuotationAction(id))}>Mark Sent to Customer</Button>
      )}
      {["SENT", "APPROVED"].includes(status) && canEditSales && (
        <>
          <Button
            disabled={pending || !hasUploadedPo}
            title={hasUploadedPo ? undefined : "Upload dulu file PO asli dari customer (lihat panel Customer PO di bawah) sebelum bisa Mark Won."}
            onClick={() => setWonOpen(true)}
          >
            Mark Won
          </Button>
          <Button disabled={pending} variant="outline" onClick={() => setLostOpen(true)}>Mark Lost</Button>
        </>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen} title="Reject Quotation" description="Provide a reason — this is recorded on the audit trail.">
        <div className="space-y-3">
          <Textarea placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason || pending} onClick={() => { setRejectOpen(false); run(() => rejectQuotationAction(id, reason)); }}>Reject</Button>
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

      <Dialog open={lostOpen} onOpenChange={setLostOpen} title="Mark Quotation Lost" description="Provide a reason for reporting.">
        <div className="space-y-3">
          <Textarea placeholder="Reason (e.g. lost to competitor, budget cut)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason || pending} onClick={() => { setLostOpen(false); run(() => markLostAction(id, reason)); }}>Mark Lost</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={wonOpen} onOpenChange={setWonOpen} title="Mark Quotation Won" description="This automatically creates the Project, folders, tasks, and notifies Finance & PM.">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Assign Project Manager (optional)</Label>
            <Select value={pmId} onChange={(e) => setPmId(e.target.value)}>
              <option value="">Unassigned — notify all PMs</option>
              {projectManagers.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWonOpen(false)}>Cancel</Button>
            <Button disabled={pending} onClick={() => {
              setWonOpen(false);
              run(async () => {
                const res = await markWonAction(id, pmId || undefined);
                if (res.ok) {
                  toast({ title: "Project created", description: `Project ${res.data.projectId} generated automatically.`, variant: "success" });
                  router.push(`/projects/${res.data.projectId}`);
                }
                return res;
              });
            }}>Confirm — Create Project</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
