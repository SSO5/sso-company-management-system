import Link from "next/link";
import { listPayments } from "@/server/finance/payments";
import { getBillingSchedule } from "@/server/finance/billing-schedule";
import { BillingScheduleCard } from "@/components/finance/billing-schedule-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PaymentsPage() {
  const [payments, billingSchedule] = await Promise.all([listPayments(), getBillingSchedule()]);
  return (
    <div className="space-y-4">
      <div><p className="workspace-eyebrow">Riwayat kas masuk</p><h1 className="text-xl font-semibold">Penerimaan pembayaran</h1><p className="text-sm text-muted-foreground">{payments.length} penerimaan tercatat. Penerimaan baru dicatat dari halaman invoice terkait.</p></div>

      {/* Melengkapi gambaran arus kas: halaman ini soal uang yang SUDAH
          masuk, kartu ini soal yang belum pernah ditagih sama sekali —
          dua ujung siklus yang sama. */}
      <BillingScheduleCard rows={billingSchedule} compact title="Belum Ditagih" />

      {payments.length === 0 ? <EmptyState title="Belum ada penerimaan yang dicatat" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Invoice</TableHead><TableHead>Pelanggan</TableHead><TableHead>Tanggal</TableHead><TableHead>Kas diterima</TableHead><TableHead>PPh dipotong</TableHead><TableHead>Metode</TableHead></TableRow></TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.number}</TableCell>
                <TableCell><Link href={`/finance/invoices/${p.invoiceId}`} className="hover:underline">{p.invoice.number}</Link></TableCell>
                <TableCell>{p.customer.companyName}</TableCell>
                <TableCell>{formatDate(p.paymentDate)}</TableCell>
                <TableCell>{formatCurrency(Number(p.amount))}</TableCell>
                <TableCell>{Number(p.withholdingTax) > 0 ? formatCurrency(Number(p.withholdingTax)) : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>{p.method.replace("_", " ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
