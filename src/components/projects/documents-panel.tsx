import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatRevisedNumber } from "@/lib/utils";
import { invoiceDueAmount } from "@/lib/workflows/calculations";
import { PoExtractUploadDialog } from "@/components/projects/po-extract-upload-dialog";
import { PoRowActions } from "@/components/projects/po-row-actions";
import { PoEditDialog } from "@/components/projects/po-edit-dialog";
import { FileDown, FileText } from "lucide-react";

interface Quotation { id: string; number: string; revision: number; grandTotal: unknown }
interface Opportunity { id: string; number: string }
interface CustomerPO {
  id: string; number: string; poDate: Date; poValue: unknown; status: string;
  paymentTerms: string | null; deliveryTerms: string | null; estimatedDeliveryDate: Date | null;
}
interface VendorPO { id: string; number: string; vendorName: string; poDate: Date; grandTotal: unknown; status: string }
interface InvoiceRow { id: string; number: string; invoiceDate: Date; grandTotal: unknown; dpPercent: unknown; paidAmount: unknown; status: string }

interface Props {
  projectId: string;
  customerId: string;
  purchaseOrderFolderId: string | null;
  opportunity: Opportunity | null;
  quotation: Quotation | null;
  purchaseOrders: CustomerPO[];
  vendorPurchaseOrders: VendorPO[];
  invoices: InvoiceRow[];
}

const CUSTOMER_PO_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  PENDING: "warning", RECEIVED: "outline", VERIFIED: "success", CANCELLED: "destructive",
};
const VENDOR_PO_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", SENT: "warning", CONFIRMED: "success", CANCELLED: "destructive",
};
const INVOICE_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", ISSUED: "outline", PARTIALLY_PAID: "warning", PAID: "success", OVERDUE: "destructive", CANCELLED: "destructive",
};

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * This is the one screen where the two sides of a job actually meet: the
 * customer's own Purchase Order (what THEY sent to SSO to confirm the deal)
 * and every Vendor Purchase Order (what SSO sent to suppliers to fulfill
 * it) both live under the same Project — see getProjectDetail's `include`.
 * Nothing here is text-matched; every link below follows a real foreign key
 * (projectId on both PurchaseOrder and VendorPurchaseOrder).
 */
export function DocumentsPanel({
  projectId, customerId, purchaseOrderFolderId, opportunity, quotation, purchaseOrders, vendorPurchaseOrders, invoices,
}: Props) {
  // "Sisa penagihan" — the persistent, always-visible answer to "what's the
  // next billing stage", computed from real data instead of a one-off chat
  // calculation nobody can see again. Total PO value (what the customer
  // actually committed to) minus what's already been invoiced (dpPercent-
  // aware, same helper the rest of the app uses for "due amount") — not
  // "outstanding", which only covers invoices that already exist.
  const activePOs = purchaseOrders.filter((po) => po.status !== "CANCELLED");
  const totalPoValue = activePOs.reduce((s, po) => s + Number(po.poValue), 0);
  const totalInvoiced = invoices
    .filter((i) => i.status !== "CANCELLED")
    .reduce((s, i) => s + invoiceDueAmount({ grandTotal: Number(i.grandTotal), dpPercent: i.dpPercent as number | null }), 0);
  const remainingToBill = totalPoValue - totalInvoiced;
  const termsToShow = activePOs.filter((po) => po.paymentTerms);

  return (
    <div className="space-y-4">
      {activePOs.length > 0 && (
        <Section title="Sisa Penagihan" hint="Total nilai PO dikurangi invoice yang sudah diterbitkan">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Total Nilai PO</p>
              <p className="font-semibold">{formatCurrency(totalPoValue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sudah Ditagih</p>
              <p className="font-semibold">{formatCurrency(totalInvoiced)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sisa Belum Ditagih</p>
              <p className={`font-semibold ${remainingToBill > 0 ? "text-warning" : "text-success"}`}>
                {formatCurrency(Math.max(remainingToBill, 0))}
              </p>
            </div>
          </div>
          {termsToShow.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-border pt-3">
              {termsToShow.map((po) => (
                <p key={po.id} className="text-xs text-muted-foreground">
                  <span className="font-mono">{po.number}</span> — Term of Payment: {po.paymentTerms}
                  {po.estimatedDeliveryDate && (
                    <span className="text-warning"> · Perkiraan tagihan berikutnya: {formatDate(po.estimatedDeliveryDate)}</span>
                  )}
                </p>
              ))}
            </div>
          )}
          {termsToShow.length === 0 && remainingToBill > 0 && (
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              Term of Payment belum tercatat untuk PO ini — tidak bisa menentukan tahap penagihan berikutnya secara
              otomatis. Lengkapi lewat &quot;Upload PO (AI-assisted)&quot; atau edit manual.
            </p>
          )}
        </Section>
      )}

      <Section title="Sales Origin" hint="Where this project came from">
        {!opportunity && !quotation ? (
          <p className="text-sm text-muted-foreground">No linked Opportunity/Quotation (project was created manually).</p>
        ) : (
          <div className="flex flex-wrap gap-3 text-sm">
            {opportunity && (
              <Link href={`/sales/opportunities/${opportunity.id}`} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Opportunity {opportunity.number}
              </Link>
            )}
            {quotation && (
              <Link href={`/sales/quotations/${quotation.id}`} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Quotation {formatRevisedNumber(quotation.number, quotation.revision)}
                <span className="text-muted-foreground">· {formatCurrency(Number(quotation.grandTotal))}</span>
              </Link>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Customer Purchase Order"
        hint="What the customer sent SSO to confirm this job"
        action={purchaseOrderFolderId && <PoExtractUploadDialog folderId={purchaseOrderFolderId} projectId={projectId} customerId={customerId} />}
      >
        {purchaseOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customer PO recorded for this project yet.</p>
        ) : (
          <div className="space-y-2">
            {purchaseOrders.map((po) => (
              <div key={po.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <div>
                  <p className="font-mono text-xs">{po.number}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(po.poDate)}</p>
                  {po.paymentTerms && <p className="mt-0.5 text-xs text-muted-foreground">TOP: {po.paymentTerms}</p>}
                  {po.estimatedDeliveryDate && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Perkiraan selesai/kirim: {formatDate(po.estimatedDeliveryDate)}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{formatCurrency(Number(po.poValue))}</span>
                  <Badge variant={CUSTOMER_PO_VARIANT[po.status]}>{po.status}</Badge>
                  <PoEditDialog po={po} />
                  <PoRowActions id={po.id} number={po.number} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Vendor Purchase Orders" hint="What SSO sent to suppliers to fulfill this job">
        {vendorPurchaseOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No vendor PO issued for this project yet — create one from Procurement &gt; Vendor Purchase Orders and pick this project under &quot;Linked Project&quot;.
          </p>
        ) : (
          <div className="space-y-2">
            {vendorPurchaseOrders.map((po) => (
              <div key={po.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <div>
                  <Link href={`/procurement/vendor-po/${po.id}`} className="font-mono text-xs hover:underline">{po.number}</Link>
                  <p className="text-xs text-muted-foreground">{po.vendorName} · {formatDate(po.poDate)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{formatCurrency(Number(po.grandTotal))}</span>
                  <Badge variant={VENDOR_PO_VARIANT[po.status]}>{po.status}</Badge>
                  <a href={`/api/procurement/vendor-po/${po.id}/pdf`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                    <FileDown className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Invoices to Customer">
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoice issued for this project yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <div>
                  <Link href={`/finance/invoices/${inv.id}`} className="font-mono text-xs hover:underline">{inv.number}</Link>
                  <p className="text-xs text-muted-foreground">{formatDate(inv.invoiceDate)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {inv.dpPercent != null && Number(inv.dpPercent) > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">DP {Number(inv.dpPercent)}%</span>
                  )}
                  <span className="font-medium">{formatCurrency(invoiceDueAmount({ grandTotal: Number(inv.grandTotal), dpPercent: inv.dpPercent as number | null }))}</span>
                  <span className="text-xs text-muted-foreground">Paid {formatCurrency(Number(inv.paidAmount))}</span>
                  <Badge variant={INVOICE_VARIANT[inv.status]}>{inv.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
