"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { costingSheetSchema, DEFAULT_COSTING_SECTIONS, type CostingSheetInput } from "@/lib/validation/costing";
import { calcCostingSummary } from "@/lib/workflows/calculations";
import { formatCurrency, formatRevisedNumber } from "@/lib/utils";
import { createCostingSheetAction, updateCostingSheetAction } from "@/server/sales/costing";
import { CostingSectionCard } from "@/components/sales/costing-section-card";
import { Plus } from "lucide-react";

interface Props {
  customers: { id: string; companyName: string; number: string }[];
  opportunities: { id: string; customerId: string; number: string; name: string }[];
  costingId?: string;
  defaultValues?: Partial<CostingSheetInput>;
}

export function CostingForm({ customers, opportunities, costingId, defaultValues }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const isEditing = Boolean(costingId);

  const { register, control, handleSubmit, formState: { isSubmitting, errors } } = useForm<CostingSheetInput>({
    resolver: zodResolver(costingSheetSchema),
    defaultValues: {
      costingDate: new Date(),
      operationalCost: 0,
      ppnPercent: 11,
      pphFinalPercent: 2,
      sections: DEFAULT_COSTING_SECTIONS,
      ...defaultValues,
    },
  });

  const { fields: sectionFields, append: appendSection, remove: removeSection } = useFieldArray({ control, name: "sections" });
  const watchedCustomerId = useWatch({ control, name: "customerId" });
  const watchedSections = useWatch({ control, name: "sections" }) || [];
  const watchedOperationalCost = useWatch({ control, name: "operationalCost" });
  const watchedPpnPercent = useWatch({ control, name: "ppnPercent" });
  const watchedPphFinalPercent = useWatch({ control, name: "pphFinalPercent" });
  const filteredOpportunities = opportunities.filter((o) => o.customerId === watchedCustomerId);

  const summary = useMemo(() => {
    try {
      return calcCostingSummary(
        watchedSections.map((s) => ({ items: (s?.items || []).filter((i) => i && i.costUnitPrice !== undefined) })),
        {
          operationalCost: Number(watchedOperationalCost || 0),
          ppnPercent: Number(watchedPpnPercent ?? 11),
          pphFinalPercent: Number(watchedPphFinalPercent ?? 2),
        }
      );
    } catch {
      return {
        totalCost: 0, totalSelling: 0, totalRevenue: 0, grossProfit: 0, grossMarginPercent: 0, totalMargin: 0,
        operationalCost: 0, ppnPercent: 11, ppnAmount: 0, pphFinalPercent: 2, pphFinalAmount: 0,
        netProfit: 0, netMarginPercent: 0, sectionTotals: [],
      };
    }
  }, [watchedSections, watchedOperationalCost, watchedPpnPercent, watchedPphFinalPercent]);

  async function onSubmit(data: CostingSheetInput) {
    if (isEditing && costingId) {
      const res = await updateCostingSheetAction(costingId, data);
      if (res.ok) {
        const synced = res.data.syncedQuotation;
        toast({
          title: "Costing sheet updated",
          description: synced ? `Quotation ${formatRevisedNumber(synced.number, synced.revision)} auto-updated to match.` : undefined,
          variant: "success",
        });
        router.push(`/sales/costing/${res.data.id}`);
      } else {
        toast({ title: "Unable to save costing sheet", description: res.error, variant: "destructive" });
      }
      return;
    }

    const res = await createCostingSheetAction(data);
    if (res.ok) {
      toast({ title: "Costing sheet created", variant: "success" });
      router.push(`/sales/costing/${res.data.id}`);
    } else {
      toast({ title: "Unable to save costing sheet", description: res.error, variant: "destructive" });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Customer</Label>
          <Select {...register("customerId")} defaultValue="">
            <option value="" disabled>Select customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
          </Select>
          {errors.customerId && <p className="text-xs text-destructive">{errors.customerId.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Opportunity</Label>
          <Select {...register("opportunityId")} defaultValue="">
            <option value="">None</option>
            {filteredOpportunities.map((o) => <option key={o.id} value={o.id}>{o.number} — {o.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Job No.</Label>
          <Input placeholder="Optional internal job number" {...register("jobNo")} />
        </div>
        <div className="col-span-1 space-y-1 sm:col-span-2 md:col-span-2">
          <Label>Project / Job Title</Label>
          <Input placeholder="e.g. Fabrication of Gearbox for PT XYZ" {...register("projectTitle")} />
          {errors.projectTitle && <p className="text-xs text-destructive">{errors.projectTitle.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Costing Date</Label>
          <Controller control={control} name="costingDate" render={({ field }) => (
            <Input type="date" value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""} onChange={(e) => field.onChange(new Date(e.target.value))} />
          )} />
        </div>
        <div className="col-span-1 space-y-1 sm:col-span-2 md:col-span-3">
          <Label>Notes</Label>
          <Textarea rows={2} {...register("notes")} />
        </div>
      </div>

      <div className="space-y-3">
        {sectionFields.map((field, idx) => (
          <CostingSectionCard
            key={field.id}
            control={control}
            register={register}
            sectionIndex={idx}
            removeSection={() => removeSection(idx)}
            canRemoveSection={sectionFields.length > 1}
          />
        ))}
        {errors.sections && <p className="text-xs text-destructive">{errors.sections.message as string}</p>}
        <Button
          type="button" variant="outline"
          onClick={() => appendSection({ code: "", name: "", items: [{ name: "", quantity: 1, unit: "pcs", currency: "IDR", costUnitPrice: 0, supplierDiscountPercent: 0, marginPercent: 35 }] })}
        >
          <Plus className="h-4 w-4" /> Add Section
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <Label className="text-sm">Ringkasan Profitabilitas (Profitability Summary)</Label>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Operasional (Rp)</Label>
              <Input type="number" step="any" {...register("operationalCost")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PPN % <span className="text-muted-foreground">(of COGS)</span></Label>
              <Input type="number" step="any" {...register("ppnPercent")} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">PPh Final % <span className="text-muted-foreground">(of COGS)</span></Label>
              <Input type="number" step="any" className="max-w-[8rem]" {...register("pphFinalPercent")} />
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total Pendapatan (Revenue)</span><span>{formatCurrency(summary.totalRevenue)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Harga Pokok (COGS)</span><span>{formatCurrency(summary.totalCost)}</span></div>
            <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">Gross Profit</span><span className="font-medium">{formatCurrency(summary.grossProfit)}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Gross Margin</span><span>{summary.grossMarginPercent.toFixed(1)}%</span></div>
            <div className="flex justify-between pt-1"><span className="text-muted-foreground">PPN ({summary.ppnPercent}%)</span><span>{formatCurrency(summary.ppnAmount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">PPh Final ({summary.pphFinalPercent}%)</span><span>{formatCurrency(summary.pphFinalAmount)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Net Profit</span><span>{formatCurrency(summary.netProfit)}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Net Margin</span><span>{summary.netMarginPercent.toFixed(1)}%</span></div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Save Costing Sheet"}</Button>
      </div>
    </form>
  );
}
