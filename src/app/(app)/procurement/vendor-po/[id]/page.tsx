import Link from "next/link";
import { notFound } from "next/navigation";
import { getVendorPurchaseOrder } from "@/server/sales/vendor-purchase-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FileDown } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  SENT: "warning",
  CONFIRMED: "success",
  CANCELLED: "destructive",
};

export default async function VendorPoDetailPage({ params }: { params: { id: string } }) {
  const po = await getVendorPurchaseOrder(params.id).catch(() => null);
  if (!po) notFound();

  let lastGroup: string | null = null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{po.number}</p>
          <h1 className="text-xl font-semibold">{po.vendorName}</h1>
          <p className="text-sm text-muted-foreground">
            {po.project ? <>Project <Link href={`/projects/${po.project.id}`} className="underline">{po.project.number}</Link> · </> : null}
            {po.customer ? po.customer.companyName : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[po.status] ?? "default"}>{po.status}</Badge>
          <a href={`/api/procurement/vendor-po/${po.id}/pdf`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline"><FileDown className="h-4 w-4" /> Download PDF</Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">PO Date</p><p className="text-sm font-medium">{formatDate(po.poDate)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Project Ref.</p><p className="text-sm font-medium">{po.projectRef ?? "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Quotation Ref.</p><p className="text-sm font-medium">{po.quotationRef ?? "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Grand Total</p><p className="text-sm font-semibold">{formatCurrency(Number(po.grandTotal))}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Vendor &amp; Delivery</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">TO (Vendor)</p>
            <p>{po.vendorName}</p>
            {po.vendorAddress && <p className="text-muted-foreground">{po.vendorAddress}</p>}
            {po.vendorAttn && <p className="text-muted-foreground">Attn: {po.vendorAttn}</p>}
            {po.vendorEmail && <p className="text-muted-foreground">{po.vendorEmail}</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Delivery Address</p>
            <p>{po.deliveryName ?? "—"}</p>
            {po.deliveryAddress && <p className="text-muted-foreground">{po.deliveryAddress}</p>}
            {po.deliveryAttn && <p className="text-muted-foreground">Attn: {po.deliveryAttn}</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Payment Terms</p>
            <p className="text-muted-foreground">{po.paymentTerms ?? "—"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Delivery Terms</p>
            <p className="text-muted-foreground">{po.deliveryTerms ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Items</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {po.items.map((it) => {
            const showGroup = it.groupLabel && it.groupLabel !== lastGroup;
            if (it.groupLabel) lastGroup = it.groupLabel;
            return (
              <div key={it.id}>
                {showGroup && <p className="mt-2 text-sm font-semibold">{it.groupLabel}</p>}
                <div className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm">
                  <span className="pl-2 text-muted-foreground">{it.description}</span>
                  <span className="whitespace-nowrap pl-4">
                    {Number(it.quantity)} {it.unit} × {formatCurrency(Number(it.unitPrice))} = <span className="font-medium text-foreground">{formatCurrency(Number(it.amount))}</span>
                  </span>
                </div>
              </div>
            );
          })}
          <div className="ml-auto mt-3 w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span>{formatCurrency(Number(po.subtotal))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>{formatCurrency(Number(po.discount))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Netto</span><span>{formatCurrency(Number(po.subtotal) - Number(po.discount))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax ({Number(po.taxPercent)}%)</span><span>{formatCurrency(Number(po.tax))}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>TOTAL AMOUNT</span><span>{formatCurrency(Number(po.grandTotal))}</span></div>
          </div>
        </CardContent>
      </Card>

      {po.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Note / Ketentuan</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-line text-sm text-muted-foreground">{po.notes}</p></CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Created by {po.createdBy.name} · Authorized by {po.signer?.name ?? "—"}
      </p>
    </div>
  );
}
