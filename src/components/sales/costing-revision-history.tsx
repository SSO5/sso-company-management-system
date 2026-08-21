import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { calcCostingSummary } from "@/lib/workflows/calculations";
import type { CostingSheetSnapshot } from "@/lib/workflows/revision-history";

interface Props {
  history: { revision: number; snapshot: unknown; createdAt: Date }[];
}

/**
 * Read-only "Riwayat Revisi" — each entry is a frozen snapshot of what this
 * costing sheet looked like at a past revision, captured right before
 * "Buat Revisi" overwrote it (see revision-history.ts). Never editable, no
 * "Convert to Quotation" here — only the current/active revision (the sheet
 * itself, above this card) can be converted.
 */
export function CostingRevisionHistory({ history }: Props) {
  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle>Riwayat Revisi</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {history.map((h) => {
          const snap = h.snapshot as unknown as CostingSheetSnapshot;
          const summary = calcCostingSummary(
            snap.sections.map((s) => ({ items: s.items })),
            { operationalCost: snap.operationalCost, ppnPercent: snap.ppnPercent, pphFinalPercent: snap.pphFinalPercent }
          );
          const allItems = snap.sections.flatMap((s) => s.items.map((i) => ({ ...i, sectionLabel: `${s.code} — ${s.name}` })));

          return (
            <div key={h.revision} className="rounded-lg border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold">R{h.revision}</p>
                  <p className="text-xs text-muted-foreground">{snap.projectTitle} · disimpan {formatDateTime(h.createdAt)}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-muted-foreground">Total Cost / Revenue</p>
                  <p data-tabular>{formatCurrency(summary.totalCost)} / {formatCurrency(summary.totalRevenue)}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Cost/Unit</TableHead>
                    <TableHead>Margin %</TableHead>
                    <TableHead>Selling Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <span className="block">{item.name}</span>
                        <span className="block text-xs text-muted-foreground">{item.sectionLabel}</span>
                      </TableCell>
                      <TableCell>{item.quantity} {item.unit}</TableCell>
                      <TableCell>{formatCurrency(item.costUnitPrice)}</TableCell>
                      <TableCell>{item.marginPercent}%</TableCell>
                      <TableCell className="font-medium">{formatCurrency(item.sellingTotalPrice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-3 py-2 text-xs text-muted-foreground">Costing Date: {formatDate(snap.costingDate)}{snap.jobNo ? ` · Job No. ${snap.jobNo}` : ""}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
