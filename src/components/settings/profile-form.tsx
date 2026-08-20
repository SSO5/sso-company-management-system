"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateOwnProfileAction } from "@/server/settings/profile";
import { brandingUrl } from "@/lib/utils";
import { TITLE_OPTIONS } from "@/lib/validation/auth";

interface OwnProfile {
  id: string; name: string; email: string; role: string;
  title: string | null; whatsappNumber: string | null; avatarUrl: string | null;
}

export function ProfileForm({ profile }: { profile: OwnProfile }) {
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<string | null>(brandingUrl(profile.avatarUrl));
  const router = useRouter();
  const { toast } = useToast();

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await updateOwnProfileAction(fd);
    setPending(false);
    if (res.ok) { toast({ title: "Profil disimpan", variant: "success" }); router.refresh(); }
    else toast({ title: "Tidak bisa menyimpan", description: res.error, variant: "destructive" });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-5" encType="multipart/form-data">
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Foto profil" className="h-16 w-16 rounded-full border border-border object-cover object-top" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted text-lg font-semibold text-muted-foreground">
            {profile.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
        )}
        <div className="space-y-1">
          <Label>Foto Profil</Label>
          <Input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} />
          <p className="text-[11px] text-muted-foreground">Ditampilkan di sidebar, topbar, dan halaman Beranda.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
        <div className="space-y-1"><Label>Nama</Label><Input name="name" defaultValue={profile.name} required /></div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input value={profile.email} disabled />
          <p className="text-[11px] text-muted-foreground">Email &amp; role hanya bisa diubah oleh Admin di Settings &gt; Pengguna.</p>
        </div>
        <div className="space-y-1">
          <Label>Jabatan</Label>
          <Input name="title" list="title-options" defaultValue={profile.title ?? ""} placeholder="mis. Direktur, Sales Engineer" />
          <datalist id="title-options">{TITLE_OPTIONS.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div className="space-y-1">
          <Label>Nomor WhatsApp</Label>
          <Input name="whatsappNumber" defaultValue={profile.whatsappNumber ?? ""} placeholder="0812xxxxxxx" />
          <p className="text-[11px] text-muted-foreground">Untuk notifikasi approval &amp; jatuh tempo.</p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan Profil"}</Button>
    </form>
  );
}
