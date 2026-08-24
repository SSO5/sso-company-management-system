"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateOwnProfileAction, sendTestWhatsAppNotificationAction } from "@/server/settings/profile";
import { brandingUrl } from "@/lib/utils";
import { TITLE_OPTIONS } from "@/lib/validation/auth";

interface OwnProfile {
  id: string; name: string; email: string; role: string;
  title: string | null; whatsappNumber: string | null; avatarUrl: string | null;
}

export function ProfileForm({ profile }: { profile: OwnProfile }) {
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<string | null>(brandingUrl(profile.avatarUrl));
  const [testingWa, setTestingWa] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onTestWhatsApp() {
    setTestingWa(true);
    const res = await sendTestWhatsAppNotificationAction();
    setTestingWa(false);
    if (res.ok) toast({ title: "Test terkirim", description: res.data.reason, variant: "success" });
    else toast({ title: "Test gagal — ini sebabnya", description: res.error, variant: "destructive" });
  }

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
          // Wrapper does the circular clip (see profile-hub.tsx for why:
          // border-radius directly on an <img> with object-fit is
          // unreliable on WebKit/Safari).
          <div className="h-16 w-16 overflow-hidden rounded-full border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Foto profil" className="h-full w-full object-cover object-top" />
          </div>
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">Untuk notifikasi approval &amp; jatuh tempo.</p>
            <Button type="button" variant="outline" size="sm" onClick={onTestWhatsApp} disabled={testingWa}>
              {testingWa ? "Mengirim..." : "Test Notifikasi"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Simpan dulu nomor di atas kalau baru diisi/diubah, baru klik Test Notifikasi — akan kirim 1 pesan WA nyata ke nomor yang tersimpan.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan Profil"}</Button>
    </form>
  );
}
