"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { recordPaymentAction } from "@/server/finance/payments";
import { formatCurrency } from "@/lib/utils";
import { round2 } from "@/lib/workflows/calculations";

// Rough default suggestion only (PPh 23 = 2% of the pre-VAT/DPP amount,
// i.e. ~1.8% of a VAT-inclusive figure) — always editable, never trusted
// as-is. This exists so the withholding field is pre-filled with something
// close to correct the moment the checkbox is ticked, instead of starting
// blank/0 and depending on someone doing the tax math by hand (that gap —
// a payment recorded net of withholding with the withholding field left at
// its 0 default — is exactly what left three real invoices stuck showing
// OVERDUE despite being economically settled).
function suggestWithholding(netAmount: number): number {
  return round2((netAmount * 0.02) / 1.09);
}

export function RecordPaymentDialog({ invoiceId, outstanding, trigger }: { invoiceId: string; outstanding: number; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [amount, setAmount] = useState("");
  const [hasWithholding, setHasWithholding] = useState(false);
  const [withholdingTax, setWithholdingTax] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  const amountNum = Number(amount) || 0;
  const withholdingNum = hasWithholding ? Number(withholdingTax) || 0 : 0;
  const remaining = useMemo(() => Math.max(0, round2(outstanding - amountNum - withholdingNum)), [outstanding, amountNum, withholdingNum]);
  const willSettleInFull = amountNum > 0 && remaining <= 0.01;

  function toggleWithholding(checked: boolean) {
    setHasWithholding(checked);
    if (checked && !withholdingTax) setWithholdingTax(String(suggestWithholding(amountNum) || ""));
    if (!checked) setWithholdingTax("");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("invoiceId", invoiceId);
    fd.set("withholdingTax", String(withholdingNum));
    const res = await recordPaymentAction(fd);
    setPending(false);
    if (res.ok) { toast({ title: "Payment recorded", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Unable to record payment", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <DialogTrigger trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen} title="Record Payment" description={`Outstanding balance: ${formatCurrency(outstanding)}`}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Payment Date</Label><Input name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></div>
            <div className="space-y-1">
              <Label>Amount diterima (tunai)</Label>
              {/* CurrencyInput: thousand-grouped display ("150.000.000") with
                  the plain digits submitted under name="amount" — one zero
                  too many is otherwise invisible in a bare number field. */}
              <CurrencyInput
                name="amount"
                required
                min={0}
                max={outstanding}
                value={amount}
                onChange={(n) => setAmount(n === null ? "" : String(n))}
              />
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <Select name="method" defaultValue="BANK_TRANSFER">
                <option value="BANK_TRANSFER">Bank Transfer</option><option value="CASH">Cash</option>
                <option value="CHECK">Check</option><option value="CREDIT_CARD">Credit Card</option><option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="col-span-2 flex items-center gap-2 rounded-md border border-border p-2">
              <input
                id="hasWithholding"
                type="checkbox"
                className="h-4 w-4"
                checked={hasWithholding}
                onChange={(e) => toggleWithholding(e.target.checked)}
              />
              <label htmlFor="hasWithholding" className="text-sm">Ada potongan PPh 23 dari customer sebelum transfer?</label>
            </div>
            {hasWithholding && (
              <div className="col-span-2 space-y-1">
                <Label>PPh 23 dipotong</Label>
                <CurrencyInput
                  min={0}
                  max={outstanding}
                  value={withholdingTax}
                  onChange={(n) => setWithholdingTax(n === null ? "" : String(n))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Estimasi otomatis (2% dari DPP) — sesuaikan dengan Bukti Potong yang diterima.
                </p>
              </div>
            )}
            <div className="space-y-1"><Label>Reference Number</Label><Input name="referenceNumber" /></div>
            <div className="space-y-1"><Label>Bank Account</Label><Input name="bankAccount" /></div>
            <div className="col-span-2 space-y-1">
              <Label>Bukti Transfer <span className="text-destructive">*</span></Label>
              <Input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" />
              <p className="text-[11px] text-muted-foreground">Foto/PDF bukti transfer wajib diupload — pembayaran tidak bisa dicatat tanpa bukti.</p>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes {!willSettleInFull && amountNum > 0 && <span className="text-destructive">* (wajib — masih ada sisa tagihan)</span>}</Label>
              <Textarea name="notes" rows={2} required={amountNum > 0 && !willSettleInFull} />
            </div>
            {amountNum > 0 && (
              <div className={`col-span-2 rounded-md border p-2 text-xs ${willSettleInFull ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10"}`}>
                Sisa tagihan setelah payment ini: <span className="font-medium">{formatCurrency(remaining)}</span> — status akan menjadi{" "}
                <span className="font-medium">{willSettleInFull ? "PAID" : "PARTIALLY_PAID"}</span>
                {!willSettleInFull && ` (tetap ditandai OVERDUE lagi kalau sudah lewat jatuh tempo)`}
              </div>
            )}
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
