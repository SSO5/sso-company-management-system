"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  submitInvoiceAction, approveInvoiceAction, rejectInvoiceAction, markInvoiceIssuedAction,
} from "@/server/finance/invoices";
import type { InvoiceStatus, UserRole } from "@prisma/client";

export function InvoiceActions({ id, status, role }: { id: string; status: InvoiceStatus; role: UserRole }) {
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
      toast({ title: "Action failed", description: res.error, variant: "destructive" });
    }
  }

  const isAdmin = role === "ADMIN";
  const canEditFinance = role === "ADMIN" || role === "FINANCE";

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && canEditFinance && (
        <Button size="sm" disabled={pending} onClick={() => run(() => submitInvoiceAction(id))}>Submit for Approval</Button>
      )}
      {status === "SUBMITTED" && isAdmin && (
        <>
          <Button size="sm" disabled={pending} onClick={() => run(() => approveInvoiceAction(id))}>Approve</Button>
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => setRejectOpen(true)}>Reject</Button>
        </>
      )}
      {status === "APPROVED" && canEditFinance && (
        <Button size="sm" disabled={pending} onClick={() => run(() => markInvoiceIssuedAction(id))}>Mark Issued to Customer</Button>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen} title="Reject Invoice" description="Provide a reason — this is recorded on the audit trail.">
        <div className="space-y-3">
          <Textarea placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason || pending} onClick={() => { setRejectOpen(false); run(() => rejectInvoiceAction(id, reason)); }}>Reject</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
