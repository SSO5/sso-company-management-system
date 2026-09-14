"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createOpportunity } from "@/server/sales/opportunities";

export function OpportunityFormDialog({
  trigger,
  customers,
  contacts,
  salesUsers,
  defaultSalesPicId,
}: {
  trigger: React.ReactElement;
  customers: { id: string; companyName: string; number: string }[];
  contacts: { id: string; customerId: string; name: string }[];
  salesUsers: { id: string; name: string }[];
  defaultSalesPicId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const filteredContacts = contacts.filter((c) => c.customerId === customerId);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await createOpportunity(Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) {
      toast({ title: "Prospek berhasil dibuat", variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Prospek belum dapat disimpan", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <DialogTrigger trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Catat prospek baru"
        description="Masukkan data yang sudah diketahui. Kontak, peluang, dan target dapat dilengkapi kemudian di ruang prospek."
      >
        <form onSubmit={onSubmit} className="space-y-5">
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Prospek dari siapa?</p>
            <div className="space-y-1">
              <Label htmlFor="customerId">Pelanggan</Label>
              <Select id="customerId" name="customerId" required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="" disabled>Pilih pelanggan</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
              </Select>
              <p className="text-[11px] text-muted-foreground">Belum ada? Tambahkan pelanggan dari ruang Pelanggan &amp; Kontak.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="contactId">Kontak pelanggan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
              <Select id="contactId" name="contactId" defaultValue="">
                <option value="">Belum ditentukan</option>
                {filteredContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          </section>

          <section className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Apa kebutuhannya?</p>
            <div className="space-y-1">
              <Label htmlFor="name">Nama pekerjaan atau kebutuhan</Label>
              <Input id="name" name="name" required placeholder="Contoh: Perbaikan motor 55 kW" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="estimatedValue">Perkiraan nilai <span className="font-normal text-muted-foreground">(Rp)</span></Label>
                <Input id="estimatedValue" name="estimatedValue" type="number" min={0} step="1" required placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="salesPicId">PIC penjualan</Label>
                <Select id="salesPicId" name="salesPicId" required defaultValue={defaultSalesPicId ?? ""}>
                  <option value="" disabled>Pilih PIC</option>
                  {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
                {defaultSalesPicId && <p className="text-[11px] text-muted-foreground">Otomatis mengikuti akun yang masuk.</p>}
              </div>
            </div>
          </section>

          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="min-h-11 w-full rounded-xl border px-4 text-left text-sm font-medium"
            aria-expanded={showDetails}
          >
            {showDetails ? "Sembunyikan detail tambahan" : "Tambahkan target, sumber, dan catatan"}
          </button>

          {showDetails && <section className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="probability">Peluang menjadi pesanan (%)</Label>
              <Input id="probability" name="probability" type="number" min={0} max={100} defaultValue={10} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expectedClosingDate">Target keputusan pelanggan</Label>
              <Input id="expectedClosingDate" name="expectedClosingDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="source">Sumber prospek</Label>
              <Input id="source" name="source" placeholder="Referensi, website, tender…" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="description">Catatan awal</Label>
              <Textarea id="description" name="description" rows={2} placeholder="Lingkup awal, kebutuhan khusus, atau informasi yang masih perlu dikonfirmasi" />
            </div>
          </section>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Buat ruang prospek"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
