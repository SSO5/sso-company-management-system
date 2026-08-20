"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";
import { createExpense, submitExpenseAction, approveExpenseAction, rejectExpenseAction, markExpensePaidAction } from "@/server/projects/tasks";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Truck } from "lucide-react";
import type { UserRole } from "@prisma/client";

interface Expense {
  id: string; number: string; category: string; description: string; date: Date;
  total: unknown; paymentStatus: string; approvalStatus: string; submittedById: string | null;
  rejectionReason: string | null; createdBy: { name: string }; vendorPurchaseOrderId: string | null;
}

const CATEGORIES = ["LABOR", "MATERIALS", "TRANSPORTATION", "ACCOMMODATION", "VENDOR", "EQUIPMENT", "MARKETING", "OTHER"];

const APPROVAL_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", SUBMITTED: "warning", APPROVED: "success", REJECTED: "destructive",
};

export function ExpensePanel({ projectId, expenses, role }: { projectId: string; expenses: Expense[]; role: UserRole }) {
  const [open, setOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [payId, setPayId] = useState<string | null>(null);
  const [payFile, setPayFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const isAdmin = role === "ADMIN";
  // Recording an expense is a PM's job; actually disbursing/confirming
  // payment against it (and attaching the receipt) is Finance's — kept
  // separate from `isAdmin` so this isn't accidentally an Admin-only gate.
  const canMarkPaid = role === "ADMIN" || role === "FINANCE" || role === "IT";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await createExpense({ ...Object.fromEntries(fd.entries()), projectId });
    if (res.ok) { toast({ title: "Expense recorded", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Unable to record expense", description: res.error, variant: "destructive" });
  }

  async function onMarkPaid(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payId) return;
    const fd = new FormData(e.currentTarget);
    fd.set("id", payId);
    fd.set("projectId", projectId);
    setPending(true);
    const res = await markExpensePaidAction(fd);
    setPending(false);
    if (res.ok) { toast({ title: "Expense marked as paid", variant: "success" }); setPayId(null); setPayFile(null); router.refresh(); }
    else toast({ title: "Unable to mark as paid", description: res.error, variant: "destructive" });
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (res.ok) router.refresh();
    else toast({ title: "Action failed", description: res.error, variant: "destructive" });
  }

  const totalCost = expenses.reduce((s, e) => s + Number(e.total), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Total recorded cost: <span className="font-medium text-foreground">{formatCurrency(totalCost)}</span></p>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Expense</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Payment</TableHead><TableHead>Approval</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>
          {expenses.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono text-xs">{e.number}</TableCell>
              <TableCell>{e.category}</TableCell>
              <TableCell>
                {e.description}
                {e.vendorPurchaseOrderId && (
                  <Link href={`/procurement/vendor-po/${e.vendorPurchaseOrderId}`} className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline" title="Dari Vendor PO">
                    <Truck className="h-3 w-3" /> PO
                  </Link>
                )}
              </TableCell>
              <TableCell>{formatDate(e.date)}</TableCell>
              <TableCell>{formatCurrency(Number(e.total))}</TableCell>
              <TableCell><Badge variant={e.paymentStatus === "PAID" ? "success" : "secondary"}>{e.paymentStatus}</Badge></TableCell>
              <TableCell>
                <Badge variant={APPROVAL_VARIANT[e.approvalStatus] ?? "default"}>{e.approvalStatus}</Badge>
                {e.approvalStatus === "REJECTED" && e.rejectionReason && (
                  <p className="mt-0.5 text-[11px] text-destructive">{e.rejectionReason}</p>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1.5">
                  {e.approvalStatus === "DRAFT" && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => submitExpenseAction(e.id, projectId))}>Submit</Button>
                  )}
                  {e.approvalStatus === "SUBMITTED" && isAdmin && (
                    <>
                      <Button size="sm" disabled={pending} onClick={() => run(() => approveExpenseAction(e.id, projectId))}>Approve</Button>
                      <Button size="sm" variant="destructive" disabled={pending} onClick={() => setRejectId(e.id)}>Reject</Button>
                    </>
                  )}
                  {e.approvalStatus === "APPROVED" && e.paymentStatus !== "PAID" && canMarkPaid && (
                    <Button size="sm" disabled={pending} onClick={() => setPayId(e.id)}>Mark as Paid</Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {expenses.length === 0 && <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>}

      <Dialog open={!!rejectId} onOpenChange={(v) => !v && setRejectId(null)} title="Reject Expense" description="Provide a reason — this is recorded on the audit trail.">
        <div className="space-y-3">
          <Textarea placeholder="Reason for rejection" value={reason} onChange={(ev) => setReason(ev.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason || pending}
              onClick={() => {
                const id = rejectId!;
                setRejectId(null);
                run(() => rejectExpenseAction(id, projectId, reason)).then(() => setReason(""));
              }}
            >
              Reject
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!payId}
        onOpenChange={(v) => { if (!v) { setPayId(null); setPayFile(null); } }}
        title="Mark Expense as Paid"
        description="Upload kwitansi/bukti transfer — expense tidak bisa ditandai Paid tanpa bukti bayar."
      >
        <form onSubmit={onMarkPaid} className="space-y-3">
          <div className="space-y-1">
            <Label>Bukti Bayar <span className="text-destructive">*</span></Label>
            <Input
              name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(ev) => setPayFile(ev.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-muted-foreground">Foto/PDF kwitansi atau bukti transfer wajib diupload.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { setPayId(null); setPayFile(null); }}>Cancel</Button>
            <Button type="submit" disabled={pending || !payFile}>{pending ? "Saving..." : "Mark as Paid"}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen} title="Record Project Expense">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select name="category" defaultValue="OTHER">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="space-y-1"><Label>Date</Label><Input name="date" type="date" required /></div>
            <div className="space-y-1"><Label>Amount (IDR)</Label><Input name="amount" type="number" min={0} required /></div>
            <div className="space-y-1"><Label>Tax (IDR)</Label><Input name="tax" type="number" min={0} defaultValue={0} /></div>
            <div className="space-y-1"><Label>Vendor</Label><Input name="vendor" /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Setiap expense baru dimulai sebagai Unpaid — status Paid hanya bisa diberikan setelah expense disetujui,
            lewat tombol &quot;Mark as Paid&quot; dengan bukti bayar terlampir.
          </p>
          <div className="space-y-1"><Label>Description</Label><Textarea name="description" rows={2} required /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Record Expense</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
