"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateNumberingSettings } from "@/server/settings/company";
import type { CompanySettings } from "@prisma/client";

// Format is {seq}/{prefix}/{roman month}/{year} (see lib/numbering.ts),
// matching SSO's real numbering SOP, e.g. 004/QUO/MKT/VII/2026. The prefix
// itself can contain "/" to encode a department code.
const FIELDS: { key: keyof CompanySettings; label: string; example: string }[] = [
  { key: "customerPrefix", label: "Customer", example: "001/CUS/MKT/VII/2026" },
  { key: "leadPrefix", label: "Lead", example: "001/LED/MKT/VII/2026" },
  { key: "opportunityPrefix", label: "Opportunity", example: "001/OPP/MKT/VII/2026" },
  { key: "quotationPrefix", label: "Quotation", example: "004/QUO/MKT/VII/2026" },
  { key: "poPrefix", label: "Purchase Order", example: "001/PO/MKT/VII/2026" },
  { key: "contractPrefix", label: "Contract", example: "001/CTR/MKT/VII/2026" },
  { key: "projectPrefix", label: "Project", example: "001/PRJ/OPS/VII/2026" },
  { key: "invoicePrefix", label: "Invoice", example: "001/INV/FIN/VII/2026" },
  { key: "paymentPrefix", label: "Payment", example: "001/PAY/FIN/VII/2026" },
  { key: "expensePrefix", label: "Expense", example: "001/EXP/FIN/VII/2026" },
  { key: "costingPrefix", label: "Costing", example: "001/CST/MKT/VII/2026" },
  { key: "vendorPoPrefix", label: "Vendor PO (Procurement)", example: "001/PO/PRO/VII/2026" },
  { key: "progressReportPrefix", label: "Progress Report", example: "001/ENG-REP/OPS/VII/2026" },
];

export function NumberingForm({ settings }: { settings: CompanySettings }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await updateNumberingSettings(Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) { toast({ title: "Numbering settings saved", variant: "success" }); router.refresh(); }
    else toast({ title: "Unable to save", description: res.error, variant: "destructive" });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">
        Prefix and digit padding are configurable here. The running counter itself is never editable —
        it only ever increments transactionally when a new record is created (see lib/numbering.ts).
      </p>
      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={f.key}>{f.label} Prefix</Label>
            <Input id={f.key} name={f.key} defaultValue={String(settings[f.key] ?? "")} />
            <p className="text-[11px] text-muted-foreground">e.g. {f.example}</p>
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="numberPadding">Digit Padding</Label>
          <Input id="numberPadding" name="numberPadding" type="number" min={2} max={8} defaultValue={settings.numberPadding} />
        </div>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save Numbering Settings"}</Button>
    </form>
  );
}
