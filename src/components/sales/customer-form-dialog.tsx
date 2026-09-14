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
import { createCustomer } from "@/server/sales/customers";

export function CustomerFormDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    const res = await createCustomer(payload);
    setPending(false);
    if (res.ok) {
      toast({ title: "Pelanggan berhasil disimpan", variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Pelanggan belum dapat disimpan", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <DialogTrigger trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen} title="Tambahkan pelanggan" description="Nomor pelanggan dibuat otomatis. Data lain dapat dilengkapi kemudian.">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="companyName">Nama perusahaan</Label>
              <Input id="companyName" name="companyName" required autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customerType">Hubungan saat ini</Label>
              <Select id="customerType" name="customerType" defaultValue="PROSPECT">
                <option value="PROSPECT">Calon pelanggan</option>
                <option value="CUSTOMER">Pelanggan</option>
                <option value="PARTNER">Mitra</option>
                <option value="OTHER">Lainnya</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="industry">Bidang usaha</Label>
              <Input id="industry" name="industry" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Telepon perusahaan</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="address">Alamat</Label>
              <Textarea id="address" name="address" rows={2} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="city">Kota</Label>
              <Input id="city" name="city" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="province">Provinsi</Label>
              <Input id="province" name="province" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="taxId">NPWP</Label>
              <Input id="taxId" name="taxId" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan pelanggan"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
