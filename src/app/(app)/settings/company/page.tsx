import { getCompanySettings } from "@/server/settings/company";
import { CompanyForm } from "@/components/settings/company-form";

export default async function CompanySettingsPage() {
  const settings = await getCompanySettings();
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Company Settings</h1></div>
      <CompanyForm settings={settings} />
    </div>
  );
}
