import { requireUserOrThrow } from "@/lib/auth/current-user";
import { SystemManualTabs } from "@/components/settings/system-manual-tabs";

export default async function SystemManualPage() {
  await requireUserOrThrow();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Panduan Operasional &amp; Pengembangan</h1>
        <p className="text-sm text-muted-foreground">
          Referensi hidup tentang cara kerja SSO Connect — alur bisnis, alur approval, sistem penomoran/folder, notifikasi, dan panduan untuk pengembangan lanjutan.
        </p>
      </div>
      <SystemManualTabs />
    </div>
  );
}
