import { getProfitabilityReport } from "@/server/reports/reports";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";

export default async function ProfitabilityReportPage() {
  const rows = await getProfitabilityReport();

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Profitability Report</h1><p className="text-sm text-muted-foreground">Revenue - Cost = Gross Profit, per project.</p></div>
      {rows.length === 0 ? <EmptyState title="No project data yet" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Customer</TableHead><TableHead>Revenue</TableHead><TableHead>Cost</TableHead><TableHead>Gross Profit</TableHead><TableHead>Gross Margin</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.number}</TableCell>
                <TableCell>{r.customer}</TableCell>
                <TableCell>{formatCurrency(r.revenue)}</TableCell>
                <TableCell>{formatCurrency(r.cost)}</TableCell>
                <TableCell className={r.grossProfit >= 0 ? "text-success" : "text-destructive"}>{formatCurrency(r.grossProfit)}</TableCell>
                <TableCell>{r.grossMargin}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
