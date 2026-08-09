import Link from "next/link";
import { listProjectExpenses } from "@/server/finance/receivables";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function ExpensesPage() {
  const expenses = await listProjectExpenses();
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Project Expenses</h1><p className="text-sm text-muted-foreground">{expenses.length} expense(s) across all projects. Add expenses from a project&apos;s Costs tab.</p></div>
      {expenses.length === 0 ? <EmptyState title="No expenses recorded yet" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Project</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs">{e.number}</TableCell>
                <TableCell><Link href={`/projects/${e.projectId}`} className="hover:underline">{e.project.number}</Link></TableCell>
                <TableCell>{e.category}</TableCell>
                <TableCell>{e.description}</TableCell>
                <TableCell>{formatDate(e.date)}</TableCell>
                <TableCell>{formatCurrency(Number(e.total))}</TableCell>
                <TableCell><Badge variant={e.paymentStatus === "PAID" ? "success" : "secondary"}>{e.paymentStatus}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
