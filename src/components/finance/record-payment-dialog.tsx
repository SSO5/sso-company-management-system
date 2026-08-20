"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { recordPaymentAction } from "@/server/finance/payments";
import { formatCurrency } from "@/lib/utils";

export function RecordPaymentDialog({ invoiceId, outstanding, trigger }: { invoiceId: string; outstanding: number; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("invoiceId", invoiceId);
    const res = await recordPaymentAction(fd);
    setPending(false);
    if (res.ok) { toast({ title: "Payment recorded", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Unable to record payment", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen} title="Record Payment" description={`Outstanding balance: ${formatCurrency(outstanding)}`}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Payment Date</Label><Input name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></div>
            <div className="space-y-1"><Label>Amount diterima (tunai)</Label><Input name="amount" type="number" min={0} max={outstanding} required /></div>
            <div className="space-y-1">
              <Label>Method</Label>
              <Select name="method" defaultValue="BANK_TRANSFER">
                <option value="BANK_TRANSFER">Bank Transfer</option><option value="CASH">Cash</option>
                <option value="CHECK">Check</option><option value="CREDIT_CARD">Credit Card</option><option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>PPh 23 dipotong <span className="text-muted-foreground">(opsional)</span></Label>
              <Input name="withholdingTax" type="number" min={0} max={outstanding} defaultValue={0} />
            </div>
            <div className="space-y-1"><Label>Reference Number</Label><Input name="referenceNumber" /></div>
            <div className="col-span-2 space-y-1"><Label>Bank Account</Label><Input name="bankAccount" /></div>
            <div className="col-span-2 space-y-1">
              <Label>Bukti Transfer <span className="text-destructive">*</span></Label>
              <Input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" />
              <p className="text-[11px] text-muted-foreground">Foto/PDF bukti transfer wajib diupload — pembayaran tidak bisa dicatat tanpa bukti.</p>
            </div>
            <div className="col-span-2 space-y-1"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Record Payment"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
