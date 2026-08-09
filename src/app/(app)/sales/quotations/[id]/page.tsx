import { getQuotation } from "@/server/sales/quotations";
import { listUsersForPicker } from "@/server/settings/users";
import { requireUser } from "@/lib/auth/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuotationActions } from "@/components/sales/quotation-actions";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatDateTime, formatRevisedNumber } from "@/lib/utils";
import Link from "next/link";
import { Eye, Download, Pencil } from "lucide-react";
import type { CommercialTermItem } from "@/lib/validation/sales";

export default async function QuotationDetailPage({ params }: { params: { id: string } }) {
  const [q, actor, pms] = await Promise.all([
    getQuotation(params.id),
    requireUser(),
    listUsersForPicker("PROJECT_MANAGER"),
  ]);
  const commercialTerms = (q.commercialTerms as CommercialTermItem[] | null) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          {q.opportunity && (
            <Link href={`/sales/opportunities/${q.opportunity.id}`} className="text-xs text-primary hover:underline">
              ← Back to Opportunity {q.opportunity.number}
            </Link>
          )}
          <p className="font-mono text-xs text-muted-foreground">{formatRevisedNumber(q.number, q.revision)}</p>
          <h1 className="text-xl font-semibold">{q.customer.companyName}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge>{q.status}</Badge>
            {q.isLocked && <Badge variant="outline">Locked</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {q.status === "DRAFT" && (actor.role === "ADMIN" || actor.role === "SALES") && (
            <Link href={`/sales/quotations/${q.id}/edit`}>
              <Button variant="outline"><Pencil className="h-4 w-4" /> Edit</Button>
            </Link>
          )}
          <a href={`/api/quotations/${q.id}/pdf?view=1`} target="_blank" rel="noreferrer">
            <Button variant="outline"><Eye className="h-4 w-4" /> View / Print PDF</Button>
          </a>
          <a href={`/api/quotations/${q.id}/pdf`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="icon" title="Download PDF"><Download className="h-4 w-4" /></Button>
          </a>
          <QuotationActions id={q.id} status={q.status} role={actor.role} projectManagers={pms} />
        </div>
      </div>

      {q.project && (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
          Won — Project <Link href={`/projects/${q.project.id}`} className="font-medium underline">{q.project.number}</Link> was created automatically.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sales PIC</span><span>{q.salesPic.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quotation Date</span><span>{formatDate(q.quotationDate)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Valid Until</span><span>{formatDate(q.validUntil)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created By</span><span>{q.createdBy.name}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Audit Trail</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Submitted</span><span>{formatDateTime(q.submittedAt)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Approved by</span><span>{q.approvedBy?.name ?? "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Approved at</span><span>{formatDateTime(q.approvedAt)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Won at</span><span>{formatDateTime(q.wonAt)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(Number(q.subtotal))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatCurrency(Number(q.discount))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(Number(q.tax))}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Grand Total</span><span>{formatCurrency(Number(q.grandTotal))}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Unit Price</TableHead><TableHead>Disc %</TableHead><TableHead>Tax %</TableHead><TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.itemName}</TableCell>
                  <TableCell>{Number(it.quantity)} {it.unit}</TableCell>
                  <TableCell>{formatCurrency(Number(it.unitPrice))}</TableCell>
                  <TableCell>{Number(it.discountPercent)}%</TableCell>
                  <TableCell>{Number(it.taxPercent)}%</TableCell>
                  <TableCell>{formatCurrency(Number(it.total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Commercial Provisions</CardTitle></CardHeader>
        <CardContent>
          {commercialTerms.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum diisi.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {commercialTerms.map((t, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-muted-foreground">{t.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
