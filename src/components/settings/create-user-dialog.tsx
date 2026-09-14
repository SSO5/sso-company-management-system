"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createUser } from "@/server/settings/users";
import { TITLE_OPTIONS } from "@/lib/validation/auth";
import { Plus } from "lucide-react";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await createUser(Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) { toast({ title: "Pengguna berhasil dibuat", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Pengguna belum dapat dibuat", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Tambah pengguna</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Tambahkan pengguna" description="Buat akun sesuai tanggung jawabnya. Hak akses mengikuti peran yang dipilih.">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1"><Label>Nama</Label><Input name="name" required /></div>
          <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" required /></div>
          <div className="space-y-1"><Label>Kata sandi sementara</Label><Input name="password" type="password" minLength={8} required /></div>
          <div className="space-y-1">
            <Label>Peran dan hak akses</Label>
            <Select name="role" defaultValue="SALES">
              <option value="ADMIN">Admin</option><option value="SALES">Sales</option>
              <option value="FINANCE">Finance</option><option value="PROJECT_MANAGER">Manajer Proyek</option>
              <option value="VIEWER">Direktur / hanya melihat</option>
              <option value="IT">IT (koreksi data & dokumen)</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Jabatan <span className="text-muted-foreground">(opsional, tampil pada tanda tangan PDF)</span></Label>
            <Input name="title" list="new-title-options" placeholder="Contoh: Marketing Manager" />
            <datalist id="new-title-options">
              {TITLE_OPTIONS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label>WhatsApp <span className="text-muted-foreground">(opsional, untuk notifikasi persetujuan dan tenggat)</span></Label>
            <Input name="whatsappNumber" type="tel" placeholder="0812xxxxxxxxx" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Buat akun"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
