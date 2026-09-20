import Link from "next/link";
import { listProjectExpenses } from "@/server/finance/receivables";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Truck } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { ExpensePanel } from "@/components/projects/expense-panel";
import { listSelectableCostTypes } from "@/server/settings/cost-types";

export default async function ExpensesPage({ searchParams }: { searchParams: { project?: string } }) {
  const actor = await requireUser();
  requirePermission(actor.role, "finance", "view");
  const [expenses, projects, costTypes] = await Promise.all([
    listProjectExpenses(),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, number: true, name: true }, orderBy: { number: "desc" } }),
    // Jenis biaya aktif untuk form pencatatan. Daftar kosong bukan galat:
    // selama Admin belum mengisinya, form tetap bekerja seperti sebelumnya.
    listSelectableCostTypes(),
  ]);
  const selected = projects.find(p => p.id === searchParams.project);
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Pengeluaran Proyek</h1><p className="text-sm text-muted-foreground">Pencatatan, persetujuan, dan pembayaran biaya dikelola di ruang Finance. Pilih proyek untuk melanjutkan.</p></div>
      <form action="/finance/expenses" className="flex flex-wrap gap-2">
        <label htmlFor="expense-project" className="sr-only">Proyek</label>
        <select id="expense-project" name="project" defaultValue={selected?.id ?? ""} className="min-h-11 min-w-0 max-w-full rounded-lg border bg-background px-3 text-sm">
          <option value="">Semua proyek</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
        </select>
        <button className="min-h-11 rounded-lg bg-primary px-4 text-sm text-primary-foreground">Tampilkan</button>
      </form>
      {selected ? <div className="space-y-4"><Link href={`/projects/${selected.id}`} className="text-sm text-primary hover:underline">Lihat progres {selected.number} →</Link><ExpensePanel projectId={selected.id} role={actor.role} costTypes={costTypes} expenses={expenses.filter(e => e.projectId === selected.id).map(e => ({ ...e, total: Number(e.total), amount: Number(e.amount), tax: Number(e.tax) }))} /></div> : expenses.length === 0 ? <EmptyState title="Belum ada pengeluaran tercatat" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Project</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs"><Link href={`/finance/expenses?project=${e.projectId}`} className="text-primary hover:underline">{e.number}</Link></TableCell>
                <TableCell><Link href={`/projects/${e.projectId}`} className="hover:underline">{e.project.number}</Link></TableCell>
                <TableCell>{e.category}</TableCell>
                <TableCell>
                  {e.description}
                  {e.vendorPurchaseOrderId && (
                    <Link href={`/procurement/vendor-po/${e.vendorPurchaseOrderId}`} className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline" title="Dari Vendor PO">
                      <Truck className="h-3 w-3" /> PO
                    </Link>
                  )}
                </TableCell>
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
