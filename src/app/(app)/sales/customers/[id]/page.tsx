import Link from "next/link";
import { getCustomer360 } from "@/server/sales/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { displayLabel } from "@/lib/display-labels";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const c = await getCustomer360(params.id);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">{children}</CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{c.number}</p>
        <h1 className="text-xl font-semibold">{c.companyName}</h1>
        <div className="mt-1 flex gap-2">
          <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>{displayLabel(c.status)}</Badge>
          <Badge variant="outline">{displayLabel(c.customerType)}</Badge>
        </div>
      </div>

      {/* 360-degree view: Customer -> Contacts -> Opportunities -> Quotations -> PO -> Contracts -> Projects -> Invoices -> Payments (section 6) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={`Kontak (${c.contacts.length})`}>
          {c.contacts.length === 0 && <p className="text-muted-foreground">Belum ada kontak.</p>}
          {c.contacts.map((ct) => (
            <div key={ct.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{ct.name} {ct.isPrimary && <Badge variant="outline" className="ml-1">Utama</Badge>}</span>
              <span className="text-muted-foreground">{ct.position ?? "-"}</span>
            </div>
          ))}
        </Section>

        <Section title={`Prospek (${c.opportunities.length})`}>
          {c.opportunities.map((o) => (
            <div key={o.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{o.number} — {o.name}</span>
              <Badge variant="outline">{displayLabel(o.status)}</Badge>
            </div>
          ))}
          {c.opportunities.length === 0 && <p className="text-muted-foreground">Belum ada prospek.</p>}
        </Section>

        <Section title={`Penawaran (${c.quotations.length})`}>
          {c.quotations.map((q) => (
            <Link key={q.id} href={`/sales/quotations/${q.id}`} className="flex justify-between border-b border-border py-1 last:border-0 hover:underline">
              <span>{q.number}</span>
              <span className="flex items-center gap-2">
                {formatCurrency(Number(q.grandTotal))} <Badge variant="outline">{displayLabel(q.status)}</Badge>
              </span>
            </Link>
          ))}
          {c.quotations.length === 0 && <p className="text-muted-foreground">Belum ada penawaran.</p>}
        </Section>

        <Section title={`PO pelanggan (${c.purchaseOrders.length})`}>
          {c.purchaseOrders.map((po) => (
            <div key={po.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{po.number}</span>
              <span>{formatCurrency(Number(po.poValue))}</span>
            </div>
          ))}
          {c.purchaseOrders.length === 0 && <p className="text-muted-foreground">Belum ada PO pelanggan.</p>}
        </Section>

        <Section title={`Kontrak (${c.contracts.length})`}>
          {c.contracts.map((ct) => (
            <div key={ct.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{ct.number}</span>
              <span className="flex items-center gap-2">{formatCurrency(Number(ct.contractValue))} <Badge variant="outline">{displayLabel(ct.status)}</Badge></span>
            </div>
          ))}
          {c.contracts.length === 0 && <p className="text-muted-foreground">Belum ada kontrak.</p>}
        </Section>

        <Section title={`Proyek (${c.projects.length})`}>
          {c.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="flex justify-between border-b border-border py-1 last:border-0 hover:underline">
              <span>{p.number}</span>
              <Badge variant="outline">{displayLabel(p.status)}</Badge>
            </Link>
          ))}
          {c.projects.length === 0 && <p className="text-muted-foreground">Belum ada proyek.</p>}
        </Section>

        <Section title={`Invoice (${c.invoices.length})`}>
          {c.invoices.map((inv) => (
            <Link key={inv.id} href={`/finance/invoices/${inv.id}`} className="flex justify-between border-b border-border py-1 last:border-0 hover:underline">
              <span>{inv.number}</span>
              <span className="flex items-center gap-2">{formatCurrency(Number(inv.grandTotal))} <Badge variant="outline">{displayLabel(inv.status)}</Badge></span>
            </Link>
          ))}
          {c.invoices.length === 0 && <p className="text-muted-foreground">Belum ada invoice.</p>}
        </Section>

        <Section title={`Penerimaan (${c.payments.length})`}>
          {c.payments.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{p.number}</span>
              <span>{formatCurrency(Number(p.amount))} — {formatDate(p.paymentDate)}</span>
            </div>
          ))}
          {c.payments.length === 0 && <p className="text-muted-foreground">Belum ada penerimaan.</p>}
        </Section>
      </div>
    </div>
  );
}
