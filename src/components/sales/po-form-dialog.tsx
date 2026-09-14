"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createPurchaseOrder } from "@/server/sales/purchase-orders";

export function PurchaseOrderFormDialog({
  trigger, customers, projects,
}: {
  trigger: React.ReactElement;
  customers: { id: string; companyName: string; number: string }[];
  projects: { id: string; number: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await createPurchaseOrder(Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) { toast({ title: "PO pelanggan berhasil dicatat", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "PO pelanggan belum dapat disimpan", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <DialogTrigger trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen} title="Catat PO pelanggan" description="Salin data dari dokumen PO asli. Hubungkan ke proyek bila ruang proyek sudah tersedia.">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Pelanggan</Label>
              <Select name="customerId" required defaultValue="">
                <option value="" disabled>Pilih pelanggan</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Proyek terkait <span className="font-normal text-muted-foreground">(opsional)</span></Label>
              <Select name="projectId" defaultValue="">
                <option value="">Belum terkait proyek</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Nomor PO pelanggan</Label>
              <Input name="number" required placeholder="EPC-L/2026-0450" />
            </div>
            <div className="space-y-1">
              <Label>Tanggal PO</Label>
              <Input name="poDate" type="date" required />
            </div>
            <div className="space-y-1">
              <Label>Nilai PO (Rp)</Label>
              <Input name="poValue" type="number" min={0} required />
            </div>
            <div className="space-y-1">
              <Label>Tanggal mulai</Label>
              <Input name="startDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label>Target selesai</Label>
              <Input name="endDate" type="date" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Term of Payment (opsional)</Label>
              <Input name="paymentTerms" placeholder="40% DP, 50% Before Delivered, 10% Retention" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Term of Delivery (opsional)</Label>
              <Input name="deliveryTerms" placeholder="ETA MAX 6 Weeks ARO" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Perkiraan Tanggal Selesai/Kirim (opsional)</Label>
              <Input name="estimatedDeliveryDate" type="date" />
              <p className="text-[11px] text-muted-foreground">Dipakai untuk perkiraan tanggal tagihan berikutnya di tab Documents.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan PO pelanggan"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
