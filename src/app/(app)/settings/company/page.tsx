import { getCompanySettings } from "@/server/settings/company";
import { CompanyForm } from "@/components/settings/company-form";

export default async function CompanySettingsPage() {
  const settings = await getCompanySettings();
  return (
    <div className="space-y-4">
      <div><p className="workspace-eyebrow">Identitas dokumen resmi</p><h1 className="text-xl font-semibold">Data perusahaan</h1><p className="text-sm text-muted-foreground">Dipakai kembali pada penawaran, invoice, laporan, dan PO vendor.</p></div>
      <CompanyForm settings={settings} />
    </div>
  );
}
