"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateCompanySettings } from "@/server/settings/company";
import type { CompanySettings } from "@prisma/client";

export function CompanyForm({ settings }: { settings: CompanySettings }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const logoPreviewSrc = settings.logoUrl ? `/api/branding/${settings.logoUrl.replace(/^branding\//, "")}` : null;
  const stampPreviewSrc = settings.stampImageUrl ? `/api/branding/${settings.stampImageUrl.replace(/^branding\//, "")}` : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await updateCompanySettings(fd);
    setPending(false);
    if (res.ok) { toast({ title: "Company settings saved", variant: "success" }); router.refresh(); }
    else toast({ title: "Unable to save", description: res.error, variant: "destructive" });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-5" encType="multipart/form-data">
      <div className="space-y-1"><Label>Company Name</Label><Input name="companyName" defaultValue={settings.companyName} required /></div>

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-medium">Logo &amp; Stempel <span className="font-normal text-muted-foreground">(dicetak di kop &amp; tanda tangan setiap PDF — tanpa ini, PDF hanya menampilkan tulisan &quot;SINERGI&quot; biasa, bukan logo asli)</span></p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Logo Perusahaan</Label>
            {logoPreviewSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreviewSrc} alt="Current logo" className="mb-1 h-10 w-auto rounded border border-border bg-white p-1" />
            )}
            <Input name="logo" type="file" accept="image/png,image/jpeg" />
          </div>
          <div className="space-y-1">
            <Label>Stempel Perusahaan</Label>
            {stampPreviewSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={stampPreviewSrc} alt="Current stamp" className="mb-1 h-14 w-14 rounded border border-border bg-white p-1" />
            )}
            <Input name="stamp" type="file" accept="image/png,image/jpeg" />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">PNG latar transparan disarankan. Stempel ini sama untuk semua dokumen; tanda tangan tetap per-user (diatur di Settings → Users).</p>
      </div>

      <div className="space-y-1"><Label>Address (baris 1 — jalan/gedung)</Label><Input name="address" defaultValue={settings.address ?? ""} placeholder="Plaza Aminta Lt. 5/504, TB Simatupang Kav. 10" /></div>
      <div className="space-y-1"><Label>Address (baris 2 — kecamatan/kota/kode pos)</Label><Input name="addressLine2" defaultValue={settings.addressLine2 ?? ""} placeholder="Pondok Pinang, Kebayoran Lama, Jakarta Selatan 12310" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Label>City</Label><Input name="city" defaultValue={settings.city ?? ""} /></div>
        <div className="space-y-1"><Label>Province</Label><Input name="province" defaultValue={settings.province ?? ""} /></div>
        <div className="space-y-1"><Label>Phone</Label><Input name="phone" defaultValue={settings.phone ?? ""} /></div>
        <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" defaultValue={settings.email ?? ""} /></div>
        <div className="space-y-1"><Label>Tax ID (NPWP)</Label><Input name="taxId" defaultValue={settings.taxId ?? ""} /></div>
        <div className="space-y-1"><Label>Currency</Label><Input name="currency" defaultValue={settings.currency} /></div>
        <div className="space-y-1"><Label>Timezone</Label><Input name="timezone" defaultValue={settings.timezone} /></div>
        <div className="space-y-1"><Label>Default Tax Rate (%)</Label><Input name="defaultTaxRatePercent" type="number" step="0.01" defaultValue={Number(settings.defaultTaxRatePercent)} /></div>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-medium">Payment Instructions (printed on Invoice PDF)</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Bank Name</Label><Input name="bankName" defaultValue={settings.bankName ?? ""} /></div>
          <div className="space-y-1"><Label>Branch</Label><Input name="bankBranch" defaultValue={settings.bankBranch ?? ""} /></div>
          <div className="space-y-1"><Label>Account Name</Label><Input name="bankAccountName" defaultValue={settings.bankAccountName ?? ""} /></div>
          <div className="space-y-1"><Label>Account Number</Label><Input name="bankAccountNumber" defaultValue={settings.bankAccountNumber ?? ""} /></div>
        </div>
      </div>

      <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save Company Settings"}</Button>
    </form>
  );
}
