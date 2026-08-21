import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { QuotationSnapshot } from "@/lib/workflows/revision-history";

interface Props {
  history: { revision: number; snapshot: unknown; createdAt: Date }[];
}

/**
 * Read-only "Riwayat Revisi" — each entry is a frozen snapshot of what this
 * quotation looked like at a past revision, captured right before
 * reviseQuotation/reviseCostingSheet overwrote it (see
 * revision-history.ts). Never editable — only the current/active revision
 * (the quotation itself, above this card) can be submitted/approved/sent.
 */
export function QuotationRevisionHistory({ history }: Props) {
  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle>Riwayat Revisi</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {history.map((h) => {
          const snap = h.snapshot as unknown as QuotationSnapshot;
          return (
            <div key={h.revision} className="rounded-lg border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    R{h.revision} <Badge variant="outline">{snap.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{snap.description ?? "—"} · disimpan {formatDateTime(h.createdAt)}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-muted-foreground">Grand Total</p>
                  <p data-tabular className="font-medium">{formatCurrency(snap.grandTotal)}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Disc %</TableHead>
                    <TableHead>Tax %</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snap.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.itemName}</TableCell>
                      <TableCell>{item.quantity} {item.unit}</TableCell>
                      <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell>{item.discountPercent}%</TableCell>
                      <TableCell>{item.taxPercent}%</TableCell>
                      <TableCell className="font-medium">{formatCurrency(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
