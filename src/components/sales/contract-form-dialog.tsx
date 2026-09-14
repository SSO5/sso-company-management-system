"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createContract } from "@/server/sales/purchase-orders";

export function ContractFormDialog({
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
    const res = await createContract(Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) { toast({ title: "Kontrak berhasil dicatat", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Kontrak belum dapat disimpan", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <DialogTrigger trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen} title="Catat kontrak" description="Data ini menghubungkan nilai, masa kerja, dan proyek. Aktivasi tetap memerlukan dokumen yang ditandatangani.">
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
              <Label>Nilai kontrak (Rp)</Label>
              <Input name="contractValue" type="number" min={0} required />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              {/* "Active" is deliberately not selectable here — a contract only
                  becomes Active through the "Aktifkan" action on the list page,
                  which requires uploading the actually-signed document. This
                  dropdown is for entering historical/edge-case records
                  (already expired/terminated/completed), not for claiming a
                  new contract is live without evidence. */}
              <Select name="status" defaultValue="DRAFT">
                <option value="DRAFT">Draf</option>
                <option value="EXPIRED">Kedaluwarsa</option>
                <option value="TERMINATED">Dihentikan</option>
                <option value="COMPLETED">Selesai</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tanggal mulai</Label>
              <Input name="startDate" type="date" required />
            </div>
            <div className="space-y-1">
              <Label>Tanggal berakhir</Label>
              <Input name="endDate" type="date" required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan kontrak"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
