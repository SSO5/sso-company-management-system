import Link from "next/link";
import { listCostingSheets } from "@/server/sales/costing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, formatRevisedNumber } from "@/lib/utils";
import { Plus } from "lucide-react";
import { displayLabel } from "@/lib/display-labels";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", FINAL: "outline", CONVERTED: "success",
};

export default async function CostingListPage() {
  const sheets = await listCostingSheets();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="workspace-eyebrow">Dasar perhitungan harga</p>
          <h1 className="text-xl font-semibold">Perhitungan biaya</h1>
          <p className="text-sm text-muted-foreground">{sheets.length} lembar perhitungan. Harga jual dihitung dari biaya dan margin.</p>
        </div>
        <Link href="/sales/costing/new"><Button><Plus className="h-4 w-4" /> Buat perhitungan</Button></Link>
      </div>

      {sheets.length === 0 ? (
        <EmptyState title="Belum ada perhitungan biaya" description="Mulai dari ruang prospek agar pelanggan dan pekerjaannya langsung terhubung." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor</TableHead>
              <TableHead>Pekerjaan</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Total harga jual</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheets.map((s) => {
              const sellingTotal = s.sections.reduce((sum, sec) => sum + sec.items.reduce((iSum, it) => iSum + Number(it.sellingTotalPrice), 0), 0);
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs"><Link href={`/sales/costing/${s.id}`} className="hover:underline">{formatRevisedNumber(s.number, s.revision)}</Link></TableCell>
                  <TableCell>{s.projectTitle}</TableCell>
                  <TableCell>{s.customer.companyName}</TableCell>
                  <TableCell>{formatDate(s.costingDate)}</TableCell>
                  <TableCell>{formatCurrency(sellingTotal)}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[s.status]}>{displayLabel(s.status)}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
