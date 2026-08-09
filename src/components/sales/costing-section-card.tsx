"use client";
import { useFieldArray, type Control, type UseFormRegister, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { calcCostingLine } from "@/lib/workflows/calculations";
import { formatCurrency } from "@/lib/utils";
import type { CostingSheetInput } from "@/lib/validation/costing";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface Props {
  control: Control<CostingSheetInput>;
  register: UseFormRegister<CostingSheetInput>;
  sectionIndex: number;
  removeSection: () => void;
  canRemoveSection: boolean;
}

/**
 * One costing section rendered as stacked cards (not a wide table) so the
 * whole costing sheet stays usable on a phone — the founder's explicit ask:
 * PIC should be able to do costing "dari laptop atau handpon". Each line
 * item only asks for the raw inputs (name, qty, cost, discount, margin);
 * cost total / selling price / selling total are always computed, never
 * typed in directly.
 */
export function CostingSectionCard({ control, register, sectionIndex, removeSection, canRemoveSection }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: `sections.${sectionIndex}.items` });
  const items = useWatch({ control, name: `sections.${sectionIndex}.items` }) || [];

  const sectionCost = items.reduce((sum, it) => {
    if (!it || !it.costUnitPrice) return sum;
    try { return sum + calcCostingLine(it).costTotal; } catch { return sum; }
  }, 0);
  const sectionSelling = items.reduce((sum, it) => {
    if (!it || !it.costUnitPrice) return sum;
    try { return sum + calcCostingLine(it).sellingTotalPrice; } catch { return sum; }
  }, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex flex-1 items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input className="h-8 w-20" placeholder="Code" {...register(`sections.${sectionIndex}.code`)} />
          <Input className="h-8 flex-1" placeholder="Section name (e.g. Material, Fabrication)" {...register(`sections.${sectionIndex}.name`)} />
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={removeSection} disabled={!canRemoveSection}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map((field, itemIndex) => {
          let calc = { costUnitAfterDiscount: 0, costTotal: 0, sellingUnitPrice: 0, sellingTotalPrice: 0 };
          const item = items[itemIndex];
          if (item?.costUnitPrice !== undefined) {
            try { calc = calcCostingLine(item); } catch { /* invalid margin mid-typing, ignore */ }
          }
          return (
            <div key={field.id} className="rounded-md border border-border p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="col-span-2 space-y-1 sm:col-span-4">
                  <Label className="text-xs">Item / Description</Label>
                  <Input placeholder="e.g. Gearbox housing, cast iron" {...register(`sections.${sectionIndex}.items.${itemIndex}.name`)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" step="any" {...register(`sections.${sectionIndex}.items.${itemIndex}.quantity`)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Input placeholder="pcs / lot / kg" {...register(`sections.${sectionIndex}.items.${itemIndex}.unit`)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cost / Unit</Label>
                  <Input type="number" step="any" {...register(`sections.${sectionIndex}.items.${itemIndex}.costUnitPrice`)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Supplier Disc %</Label>
                  <Input type="number" step="any" {...register(`sections.${sectionIndex}.items.${itemIndex}.supplierDiscountPercent`)} />
                </div>
                <div className="col-span-2 space-y-1 sm:col-span-4">
                  <Label className="text-xs">Margin % <span className="text-muted-foreground">(varies per item — cross-subsidize freely)</span></Label>
                  <Input type="number" step="any" {...register(`sections.${sectionIndex}.items.${itemIndex}.marginPercent`)} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>Cost total: <span className="font-medium text-foreground">{formatCurrency(calc.costTotal)}</span></span>
                  <span>Selling/unit: <span className="font-medium text-foreground">{formatCurrency(calc.sellingUnitPrice)}</span></span>
                  <span>Selling total: <span className="font-medium text-foreground">{formatCurrency(calc.sellingTotalPrice)}</span></span>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(itemIndex)} disabled={fields.length === 1}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          type="button" size="sm" variant="outline"
          onClick={() => append({ name: "", quantity: 1, unit: "pcs", currency: "IDR", costUnitPrice: 0, supplierDiscountPercent: 0, marginPercent: 35 })}
        >
          <Plus className="h-3.5 w-3.5" /> Add Line Item
        </Button>
        <div className="flex justify-end gap-4 border-t border-border pt-2 text-sm">
          <span className="text-muted-foreground">Section cost: <span className="font-medium text-foreground">{formatCurrency(sectionCost)}</span></span>
          <span className="text-muted-foreground">Section selling: <span className="font-semibold text-foreground">{formatCurrency(sectionSelling)}</span></span>
        </div>
      </CardContent>
    </Card>
  );
}
