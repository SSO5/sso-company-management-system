import { listChartOfAccounts } from "@/server/finance/chart-of-accounts";
import { ChartOfAccountFormDialog } from "@/components/settings/chart-of-account-form-dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Aset", LIABILITY: "Liabilitas", EQUITY: "Ekuitas", REVENUE: "Pendapatan", EXPENSE: "Beban",
};

export default async function ChartOfAccountsPage() {
  const accounts = await listChartOfAccounts();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bagan Akun (Chart of Accounts)</h1>
          <p className="text-sm text-muted-foreground">
            Fondasi pembukuan — akun dan saldo awal. Dikelola bersama oleh Admin dan akuntan internal.
          </p>
        </div>
        <ChartOfAccountFormDialog />
      </div>

      {accounts.length === 0 ? (
        <EmptyState title="Belum ada akun" description="Buat akun pertama untuk mulai menyusun bagan akun perusahaan." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead><TableHead>Nama Akun</TableHead><TableHead>Tipe</TableHead>
              <TableHead>Saldo Awal</TableHead><TableHead>Status</TableHead><TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">{a.code}</TableCell>
                <TableCell>{a.name}{a.description && <p className="text-[11px] text-muted-foreground">{a.description}</p>}</TableCell>
                <TableCell>{TYPE_LABEL[a.type] ?? a.type}</TableCell>
                <TableCell>{formatCurrency(Number(a.openingBalance))}</TableCell>
                <TableCell><Badge variant={a.isActive ? "success" : "secondary"}>{a.isActive ? "Aktif" : "Nonaktif"}</Badge></TableCell>
                <TableCell><ChartOfAccountFormDialog account={a} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
