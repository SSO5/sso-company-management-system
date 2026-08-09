import Link from "next/link";
import { getCustomer360 } from "@/server/sales/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

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
          <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>{c.status}</Badge>
          <Badge variant="outline">{c.customerType}</Badge>
        </div>
      </div>

      {/* 360-degree view: Customer -> Contacts -> Opportunities -> Quotations -> PO -> Contracts -> Projects -> Invoices -> Payments (section 6) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={`Contacts (${c.contacts.length})`}>
          {c.contacts.length === 0 && <p className="text-muted-foreground">No contacts yet.</p>}
          {c.contacts.map((ct) => (
            <div key={ct.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{ct.name} {ct.isPrimary && <Badge variant="outline" className="ml-1">Primary</Badge>}</span>
              <span className="text-muted-foreground">{ct.position ?? "-"}</span>
            </div>
          ))}
        </Section>

        <Section title={`Opportunities (${c.opportunities.length})`}>
          {c.opportunities.map((o) => (
            <div key={o.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{o.number} — {o.name}</span>
              <Badge variant="outline">{o.status}</Badge>
            </div>
          ))}
          {c.opportunities.length === 0 && <p className="text-muted-foreground">None yet.</p>}
        </Section>

        <Section title={`Quotations (${c.quotations.length})`}>
          {c.quotations.map((q) => (
            <Link key={q.id} href={`/sales/quotations/${q.id}`} className="flex justify-between border-b border-border py-1 last:border-0 hover:underline">
              <span>{q.number}</span>
              <span className="flex items-center gap-2">
                {formatCurrency(Number(q.grandTotal))} <Badge variant="outline">{q.status}</Badge>
              </span>
            </Link>
          ))}
          {c.quotations.length === 0 && <p className="text-muted-foreground">None yet.</p>}
        </Section>

        <Section title={`Purchase Orders (${c.purchaseOrders.length})`}>
          {c.purchaseOrders.map((po) => (
            <div key={po.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{po.number}</span>
              <span>{formatCurrency(Number(po.poValue))}</span>
            </div>
          ))}
          {c.purchaseOrders.length === 0 && <p className="text-muted-foreground">None yet.</p>}
        </Section>

        <Section title={`Contracts (${c.contracts.length})`}>
          {c.contracts.map((ct) => (
            <div key={ct.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{ct.number}</span>
              <span className="flex items-center gap-2">{formatCurrency(Number(ct.contractValue))} <Badge variant="outline">{ct.status}</Badge></span>
            </div>
          ))}
          {c.contracts.length === 0 && <p className="text-muted-foreground">None yet.</p>}
        </Section>

        <Section title={`Projects (${c.projects.length})`}>
          {c.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="flex justify-between border-b border-border py-1 last:border-0 hover:underline">
              <span>{p.number}</span>
              <Badge variant="outline">{p.status}</Badge>
            </Link>
          ))}
          {c.projects.length === 0 && <p className="text-muted-foreground">None yet.</p>}
        </Section>

        <Section title={`Invoices (${c.invoices.length})`}>
          {c.invoices.map((inv) => (
            <Link key={inv.id} href={`/finance/invoices/${inv.id}`} className="flex justify-between border-b border-border py-1 last:border-0 hover:underline">
              <span>{inv.number}</span>
              <span className="flex items-center gap-2">{formatCurrency(Number(inv.grandTotal))} <Badge variant="outline">{inv.status}</Badge></span>
            </Link>
          ))}
          {c.invoices.length === 0 && <p className="text-muted-foreground">None yet.</p>}
        </Section>

        <Section title={`Payments (${c.payments.length})`}>
          {c.payments.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{p.number}</span>
              <span>{formatCurrency(Number(p.amount))} — {formatDate(p.paymentDate)}</span>
            </div>
          ))}
          {c.payments.length === 0 && <p className="text-muted-foreground">None yet.</p>}
        </Section>
      </div>
    </div>
  );
}
