"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateThemeSettings } from "@/server/settings/theme";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { brandingUrl, cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function ThemeForm({
  themePreset, dashboardBackgroundUrl,
}: { themePreset: string; dashboardBackgroundUrl: string | null }) {
  const [selected, setSelected] = useState(themePreset);
  const [preview, setPreview] = useState<string | null>(brandingUrl(dashboardBackgroundUrl));
  const [removeBackground, setRemoveBackground] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { setPreview(URL.createObjectURL(file)); setRemoveBackground(false); }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("themePreset", selected);
    const res = await updateThemeSettings(fd);
    setPending(false);
    if (res.ok) { toast({ title: "Tema disimpan", variant: "success" }); router.refresh(); }
    else toast({ title: "Tidak bisa menyimpan", description: res.error, variant: "destructive" });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5 rounded-lg border border-border bg-card p-5" encType="multipart/form-data">
      <div className="space-y-2">
        <Label>Warna Tema</Label>
        <p className="text-[11px] text-muted-foreground">
          Warna status (kuning = perlu perhatian, merah = bermasalah, hijau = beres) tetap sama di semua pilihan —
          hanya warna utama aplikasi yang berubah.
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                selected === p.id ? "border-primary ring-1 ring-primary" : "border-border hover:bg-accent"
              )}
            >
              <span className="relative h-6 w-6 shrink-0 rounded-full border border-border/50" style={{ background: p.swatch }}>
                {selected === p.id && <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" />}
              </span>
              <span className="font-medium">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <Label>Foto Latar Dashboard</Label>
        <p className="text-[11px] text-muted-foreground">
          Ditampilkan sebagai pita foto di atas halaman Beranda, dengan gradasi gelap ke transparan supaya teks tetap
          terbaca. Kosongkan untuk memakai tampilan polos seperti sekarang.
        </p>
        {preview && !removeBackground && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Foto latar saat ini" className="h-28 w-full rounded-md border border-border object-cover" />
        )}
        <Input name="background" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} />
        {dashboardBackgroundUrl && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox" name="removeBackground"
              checked={removeBackground}
              onChange={(e) => { setRemoveBackground(e.target.checked); if (e.target.checked) setPreview(null); }}
            />
            Hapus foto latar yang ada
          </label>
        )}
      </div>

      <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan Tema"}</Button>
    </form>
  );
}
