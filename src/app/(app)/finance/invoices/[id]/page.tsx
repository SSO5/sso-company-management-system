import { getInvoice } from "@/server/finance/invoices";
import { requireUser } from "@/lib/auth/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecordPaymentDialog } from "@/components/finance/record-payment-dialog";
import { InvoiceActions } from "@/components/finance/invoice-actions";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FileDown } from "lucide-react";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const [inv, actor] = await Promise.all([getInvoice(params.id), requireUser()]);
  const outstanding = Number(inv.grandTotal) - Number(inv.paidAmount);
  const canRecordPayment = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status);
  let lastGroup: string | null = null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{inv.number}</p>
          <h1 className="text-xl font-semibold">{inv.customer.companyName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge>{inv.status}</Badge>
            {inv.isLocked && <Badge variant="outline">Locked</Badge>}
            {inv.project && <span className="text-xs text-muted-foreground">Project {inv.project.number}</span>}
            {inv.contact && <span className="text-xs text-muted-foreground">Attn: {inv.contact.name}</span>}
          </div>
          {inv.status === "REJECTED" && inv.rejectionReason && (
            <p className="mt-1 text-xs text-destructive">Rejected{inv.rejectedBy ? ` by ${inv.rejectedBy.name}` : ""}: {inv.rejectionReason}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline"><FileDown className="h-4 w-4" /> Download PDF</Button>
          </a>
          {outstanding > 0 && canRecordPayment && (
            <RecordPaymentDialog invoiceId={inv.id} outstanding={outstanding} trigger={<Button>Record Payment</Button>} />
          )}
          <InvoiceActions id={inv.id} status={inv.status} role={actor.role} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Dates &amp; References</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Invoice Date</span><span>{formatDate(inv.invoiceDate)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Due Date</span><span>{formatDate(inv.dueDate)}</span></div>
          {inv.customerPO && <div className="flex justify-between"><span className="text-muted-foreground">Customer PO</span><span>{inv.customerPO}</span></div>}
          {inv.poDate && <div className="flex justify-between"><span className="text-muted-foreground">PO Date</span><span>{formatDate(inv.poDate)}</span></div>}
          {inv.deliveryDate && <div className="flex justify-between"><span className="text-muted-foreground">Delivery Date</span><span>{formatDate(inv.deliveryDate)}</span></div>}
          {inv.jobNo && <div className="flex justify-between"><span className="text-muted-foreground">Job No.</span><span>{inv.jobNo}</span></div>}
          {inv.salesPic && <div className="flex justify-between"><span className="text-muted-foreground">Sales PIC</span><span>{inv.salesPic.name}</span></div>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Totals</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Grand Total</span><span>{formatCurrency(Number(inv.grandTotal))}</span></div>
          {inv.dpPercent != null && <div className="flex justify-between"><span className="text-muted-foreground">DP %</span><span>{Number(inv.dpPercent)}%</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{formatCurrency(Number(inv.paidAmount))}</span></div>
          <div className="flex justify-between font-semibold"><span>Outstanding</span><span>{formatCurrency(outstanding)}</span></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Payments</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          {inv.payments.length === 0 && <p className="text-muted-foreground">No payments yet.</p>}
          {inv.payments.map((p) => (
            <div key={p.id} className="flex justify-between"><span>{p.number}</span><span>{formatCurrency(Number(p.amount))} · {formatDate(p.paymentDate)}</span></div>
          ))}
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {inv.items.map((it) => {
            const showGroup = it.groupLabel && it.groupLabel !== lastGroup;
            if (it.groupLabel) lastGroup = it.groupLabel;
            return (
              <div key={it.id}>
                {showGroup && <p className="mt-2 text-sm font-semibold">{it.groupLabel}</p>}
                <div className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm">
                  <span className="pl-2 text-muted-foreground">{it.description}</span>
                  {it.isNote ? (
                    <span className="text-xs text-muted-foreground">note</span>
                  ) : (
                    <span className="whitespace-nowrap pl-4">
                      {Number(it.quantity)} {it.unit} × {formatCurrency(Number(it.unitPrice))} (PPN {Number(it.taxPercent)}%) = <span className="font-medium text-foreground">{formatCurrency(Number(it.total))}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {inv.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Note</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-line text-sm text-muted-foreground">{inv.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
