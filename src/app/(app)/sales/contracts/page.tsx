import { listContracts } from "@/server/sales/purchase-orders";
import { listCustomers } from "@/server/sales/customers";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContractFormDialog } from "@/components/sales/contract-form-dialog";
import { ActivateContractDialog } from "@/components/sales/activate-contract-dialog";
import { formatCurrency, formatDate, daysBetween } from "@/lib/utils";
import { Plus } from "lucide-react";
import { displayLabel } from "@/lib/display-labels";

export default async function ContractsPage() {
  const [contracts, customers, projects] = await Promise.all([
    listContracts(), listCustomers(),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, number: true } }),
  ]);
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Kontrak</h1><p className="text-sm text-muted-foreground">{contracts.length} kontrak tercatat</p></div>
        <ContractFormDialog customers={customers} projects={projects} trigger={<Button><Plus className="h-4 w-4" /> Tambah kontrak</Button>} />
      </div>
      {contracts.length === 0 ? <EmptyState title="Belum ada kontrak" description="Tambahkan kontrak yang sudah diterima agar masa berlaku dan nilainya dapat dipantau." /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Pelanggan</TableHead><TableHead>Nilai</TableHead><TableHead>Berakhir</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {contracts.map((ct) => {
              const daysLeft = daysBetween(new Date(ct.endDate), now);
              const expiringSoon = ct.status === "ACTIVE" && daysLeft <= 30 && daysLeft >= 0;
              return (
                <TableRow key={ct.id}>
                  <TableCell className="font-mono text-xs">{ct.number}</TableCell>
                  <TableCell>{ct.customer.companyName}</TableCell>
                  <TableCell>{formatCurrency(Number(ct.contractValue))}</TableCell>
                  <TableCell className={expiringSoon ? "font-medium text-warning" : ""}>{formatDate(ct.endDate)}{expiringSoon && " (segera berakhir)"}</TableCell>
                  <TableCell><Badge variant="outline">{displayLabel(ct.status)}</Badge></TableCell>
                  <TableCell>{ct.status === "DRAFT" && <ActivateContractDialog contractId={ct.id} contractNumber={ct.number} />}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
