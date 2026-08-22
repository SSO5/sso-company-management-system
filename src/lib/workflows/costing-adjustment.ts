import { calcCostingLine } from "@/lib/workflows/calculations";
import type { RevisionAction } from "@/lib/ai/parse-revision-command";
import type { CostingSheetInput } from "@/lib/validation/costing";

export class UnsupportedRevisionError extends Error {}

/**
 * Applies ONE parsed Telegram command onto a costing sheet's in-memory
 * shape — pure function, no DB access, safe to call twice (once to build
 * the confirmation preview, once for real at commit time with the exact
 * same stored action). Every branch only ever touches marginPercent,
 * operationalCost, or a single item's quantity — never cost/discount
 * fields, since those represent what a supplier actually charges, not
 * something a WhatsApp/Telegram message should be able to silently rewrite.
 */
export function applyCostingAdjustment(input: CostingSheetInput, action: RevisionAction): CostingSheetInput {
  switch (action.type) {
    case "percent_adjustment": {
      const factor = 1 + action.percent / 100;
      if (factor <= 0) throw new UnsupportedRevisionError("Penyesuaian ini akan membuat harga jual jadi nol atau negatif.");
      return {
        ...input,
        sections: input.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => {
            const current = calcCostingLine(item);
            const targetSellingUnit = current.sellingUnitPrice * factor;
            // Solve marginPercent backwards from the target selling price —
            // matches "naikkan HARGA 10%" literally, instead of shifting the
            // margin percentage by 10 points (a different, larger effect).
            const newMargin = (1 - current.costUnitAfterDiscount / targetSellingUnit) * 100;
            if (!Number.isFinite(newMargin) || newMargin < 0 || newMargin >= 100) {
              throw new UnsupportedRevisionError(
                `Penyesuaian ini menghasilkan margin tidak valid (${newMargin.toFixed(1)}%) untuk item "${item.name}".`
              );
            }
            return { ...item, marginPercent: Math.round(newMargin * 100) / 100 };
          }),
        })),
      };
    }
    case "operational_cost_delta": {
      const newOperationalCost = input.operationalCost + action.amount;
      if (newOperationalCost < 0) throw new UnsupportedRevisionError("Biaya operasional tidak bisa jadi negatif.");
      return { ...input, operationalCost: newOperationalCost };
    }
    case "item_quantity": {
      const needle = action.itemName.trim().toLowerCase();
      const matches = input.sections.flatMap((section) => section.items.filter((item) => item.name.toLowerCase().includes(needle)));
      if (matches.length === 0) throw new UnsupportedRevisionError(`Tidak ada item bernama "${action.itemName}" di costing sheet ini.`);
      if (matches.length > 1) throw new UnsupportedRevisionError(`Ada ${matches.length} item yang cocok dengan "${action.itemName}" — sebutkan nama yang lebih spesifik.`);
      return {
        ...input,
        sections: input.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => (item.name.toLowerCase().includes(needle) ? { ...item, quantity: action.quantity } : item)),
        })),
      };
    }
    case "unsupported":
      throw new UnsupportedRevisionError(action.reason);
  }
}
