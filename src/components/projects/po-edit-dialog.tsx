"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { updatePurchaseOrder } from "@/server/sales/purchase-orders";
import { Pencil } from "lucide-react";

interface EditablePO {
  id: string; number: string; poDate: Date; poValue: unknown; status: string;
  paymentTerms: string | null; deliveryTerms: string | null; estimatedDeliveryDate: Date | null;
}

function toDateInputValue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * The missing "edit" for PurchaseOrder — until Aug 2026 only create/delete
 * existed, so there was no way to correct a real DP/delivery date after the
 * fact. Saving here cascades to any linked Milestone (see
 * updatePurchaseOrder()'s doc comment) and, since Sisa Penagihan/Accounts
 * Receivable/Invoices/Payments/Dashboard/notifications all read PurchaseOrder
 * live, everywhere else downstream just follows automatically.
 */
export function PoEditDialog({ po }: { po: EditablePO }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    const res = await updatePurchaseOrder(po.id, Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) {
      toast({ title: "PO diperbarui", description: "Milestone terkait ikut disesuaikan.", variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Tidak bisa menyimpan", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <Button size="icon" variant="ghost" title="Edit PO" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Edit PO ${po.number}`}
        description="Perubahan tanggal DP/perkiraan kirim otomatis diteruskan ke milestone, jadwal penagihan, dan notifikasi terkait."
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="po-edit-number">PO Number (dari customer)</Label>
            <Input id="po-edit-number" name="number" required defaultValue={po.number} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="po-edit-date">PO Date (dasar tanggal DP)</Label>
              <Input id="po-edit-date" name="poDate" type="date" required defaultValue={toDateInputValue(po.poDate)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="po-edit-value">PO Value (IDR)</Label>
              <Input id="po-edit-value" name="poValue" type="number" min={0} required defaultValue={Number(po.poValue)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="po-edit-status">Status</Label>
            <Select id="po-edit-status" name="status" defaultValue={po.status}>
              <option value="PENDING">Pending</option>
              <option value="RECEIVED">Received</option>
              <option value="VERIFIED">Verified</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="po-edit-payment-terms">Term of Payment</Label>
            <Input id="po-edit-payment-terms" name="paymentTerms" defaultValue={po.paymentTerms ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="po-edit-delivery-terms">Term of Delivery</Label>
            <Input id="po-edit-delivery-terms" name="deliveryTerms" defaultValue={po.deliveryTerms ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="po-edit-est-delivery">Perkiraan Tanggal Selesai/Kirim</Label>
            <Input
              id="po-edit-est-delivery" name="estimatedDeliveryDate" type="date"
              defaultValue={toDateInputValue(po.estimatedDeliveryDate)}
            />
            <p className="text-[11px] text-muted-foreground">
              Dipakai untuk Sisa Penagihan, Accounts Receivable, dan notifikasi jatuh tempo — ubah di sini, bukan di
              tab Milestones.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan Perubahan"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
