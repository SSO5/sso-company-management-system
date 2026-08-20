import { getThemeSettings } from "@/server/settings/theme";
import { ThemeForm } from "@/components/settings/theme-form";

export default async function ThemePage() {
  // Matches settings/company/page.tsx's pattern: the page itself just
  // requires being signed in (getThemeSettings -> requireUserOrThrow); the
  // "settings","manage" gate lives on updateThemeSettings, so viewing here
  // never throws for a role that can see the nav link but can't save.
  const settings = await getThemeSettings();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Tema</h1>
        <p className="text-sm text-muted-foreground">Warna utama dan foto latar Beranda — berlaku untuk semua pengguna.</p>
      </div>
      <ThemeForm themePreset={settings.themePreset} dashboardBackgroundUrl={settings.dashboardBackgroundUrl} />
    </div>
  );
}
