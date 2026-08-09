import Link from "next/link";
import { listQuotations } from "@/server/sales/quotations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, formatRevisedNumber } from "@/lib/utils";
import { Plus } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", SUBMITTED: "warning", UNDER_REVIEW: "warning", APPROVED: "outline",
  REJECTED: "destructive", SENT: "outline", WON: "success", LOST: "destructive",
  EXPIRED: "secondary", CANCELLED: "secondary",
};

export default async function QuotationsPage() {
  const quotations = await listQuotations();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Quotations</h1>
          <p className="text-sm text-muted-foreground">{quotations.length} quotation(s)</p>
        </div>
        <Link href="/sales/quotations/new"><Button><Plus className="h-4 w-4" /> New Quotation</Button></Link>
      </div>

      {quotations.length === 0 ? (
        <EmptyState title="No quotations yet" description="Create a quotation from an opportunity to start the deal cycle." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Sales PIC</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Grand Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotations.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-mono text-xs"><Link href={`/sales/quotations/${q.id}`} className="hover:underline">{formatRevisedNumber(q.number, q.revision)}</Link></TableCell>
                <TableCell>{q.customer.companyName}</TableCell>
                <TableCell>{q.salesPic.name}</TableCell>
                <TableCell>{formatDate(q.quotationDate)}</TableCell>
                <TableCell>{formatCurrency(Number(q.grandTotal))}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[q.status]}>{q.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
