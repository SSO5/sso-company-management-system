import { getInvoice } from "@/server/finance/invoices";
import { requireUser } from "@/lib/auth/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecordPaymentDialog } from "@/components/finance/record-payment-dialog";
import { InvoiceActions } from "@/components/finance/invoice-actions";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { invoiceDueAmount, invoiceOutstanding } from "@/lib/workflows/calculations";
import { FileDown } from "lucide-react";
import { displayLabel } from "@/lib/display-labels";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const [inv, actor] = await Promise.all([getInvoice(params.id), requireUser()]);
  const dueAmount = invoiceDueAmount(inv);
  const outstanding = invoiceOutstanding(inv);
  const canRecordPayment = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status);
  let lastGroup: string | null = null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{inv.number}</p>
          <h1 className="text-xl font-semibold">{inv.customer.companyName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge>{displayLabel(inv.status)}</Badge>
            {inv.isLocked && <Badge variant="outline">Dikunci</Badge>}
            {inv.project && <span className="text-xs text-muted-foreground">Proyek {inv.project.number}</span>}
            {inv.contact && <span className="text-xs text-muted-foreground">Tujuan: {inv.contact.name}</span>}
          </div>
          {inv.status === "REJECTED" && inv.rejectionReason && (
            <p className="mt-1 text-xs text-destructive">Ditolak{inv.rejectedBy ? ` oleh ${inv.rejectedBy.name}` : ""}: {inv.rejectionReason}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/invoices/${inv.id}/pdf?view=1`} data-document-title={`Invoice ${inv.number}`}>
            <Button size="sm" variant="outline"><FileDown className="h-4 w-4" /> Pratinjau PDF</Button>
          </a>
          {outstanding > 0 && canRecordPayment && (
            <RecordPaymentDialog invoiceId={inv.id} outstanding={outstanding} trigger={<Button>Catat penerimaan</Button>} />
          )}
          <InvoiceActions id={inv.id} status={inv.status} role={actor.role} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Tanggal dan referensi</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Tanggal invoice</span><span>{formatDate(inv.invoiceDate)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Jatuh tempo</span><span>{formatDate(inv.dueDate)}</span></div>
          {inv.customerPO && <div className="flex justify-between"><span className="text-muted-foreground">PO pelanggan</span><span>{inv.customerPO}</span></div>}
          {inv.poDate && <div className="flex justify-between"><span className="text-muted-foreground">Tanggal PO</span><span>{formatDate(inv.poDate)}</span></div>}
          {inv.deliveryDate && <div className="flex justify-between"><span className="text-muted-foreground">Tanggal penyerahan</span><span>{formatDate(inv.deliveryDate)}</span></div>}
          {inv.jobNo && <div className="flex justify-between"><span className="text-muted-foreground">Nomor pekerjaan</span><span>{inv.jobNo}</span></div>}
          {inv.salesPic && <div className="flex justify-between"><span className="text-muted-foreground">PIC penjualan</span><span>{inv.salesPic.name}</span></div>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Ringkasan nilai</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          {inv.dpPercent != null && Number(inv.dpPercent) > 0 ? (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Nilai Kontrak Penuh</span><span>{formatCurrency(Number(inv.grandTotal))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">DP %</span><span>{Number(inv.dpPercent)}%</span></div>
              <div className="flex justify-between font-medium"><span>Tagihan Invoice Ini</span><span>{formatCurrency(dueAmount)}</span></div>
            </>
          ) : (
            <div className="flex justify-between"><span className="text-muted-foreground">Total tagihan</span><span>{formatCurrency(dueAmount)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">Dibayar (tunai)</span><span>{formatCurrency(Number(inv.paidAmount))}</span></div>
          {Number(inv.withholdingTax) > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Dipotong PPh 23 (kredit pajak)</span><span>{formatCurrency(Number(inv.withholdingTax))}</span></div>
          )}
          <div className="flex justify-between font-semibold"><span>Sisa tagihan</span><span>{formatCurrency(outstanding)}</span></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Riwayat penerimaan</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          {inv.payments.length === 0 && <p className="text-muted-foreground">Belum ada penerimaan.</p>}
          {inv.payments.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>{p.number}</span>
              <span>
                {formatCurrency(Number(p.amount))}
                {Number(p.withholdingTax) > 0 && <span className="text-xs text-muted-foreground"> + PPh23 {formatCurrency(Number(p.withholdingTax))}</span>}
                {" "}· {formatDate(p.paymentDate)}
              </span>
            </div>
          ))}
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Rincian tagihan</CardTitle></CardHeader>
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
                    <span className="text-xs text-muted-foreground">catatan</span>
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
          <CardHeader><CardTitle className="text-sm">Catatan</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-line text-sm text-muted-foreground">{inv.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
