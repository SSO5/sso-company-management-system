import { listPurchaseOrders } from "@/server/sales/purchase-orders";
import { listCustomers } from "@/server/sales/customers";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PurchaseOrderFormDialog } from "@/components/sales/po-form-dialog";
import { PoEditDialog } from "@/components/projects/po-edit-dialog";
import { PoRowActions } from "@/components/projects/po-row-actions";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import { displayLabel } from "@/lib/display-labels";

export default async function PurchaseOrdersPage() {
  const [pos, customers, projects, actor] = await Promise.all([
    listPurchaseOrders(), listCustomers(),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, number: true } }),
    requireUser(),
  ]);
  // Editing/correcting a customer PO's own record (number, dates, value,
  // status) is Sales' authority — see the "Customer PO" section on a
  // project's Documents tab, which is deliberately read-only and points
  // here instead. Delete stays ADMIN/IT-only (matches requirePermission's
  // "sales","delete" grant, which SALES itself doesn't have).
  const canEdit = ["ADMIN", "SALES", "IT"].includes(actor.role);
  const canDelete = ["ADMIN", "IT"].includes(actor.role);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">PO Pelanggan</h1><p className="text-sm text-muted-foreground">{pos.length} PO tercatat</p></div>
        <PurchaseOrderFormDialog customers={customers} projects={projects} trigger={<Button><Plus className="h-4 w-4" /> Tambah PO</Button>} />
      </div>
      {pos.length === 0 ? <EmptyState title="Belum ada PO pelanggan" description="Catat PO asli yang diterima dari pelanggan dan kaitkan ke proyek terkait." /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Pelanggan</TableHead><TableHead>Proyek</TableHead><TableHead>Nilai</TableHead><TableHead>Tanggal PO</TableHead><TableHead>Status</TableHead>{(canEdit || canDelete) && <TableHead>Aksi</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {pos.map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-mono text-xs">{po.number}</TableCell>
                <TableCell>{po.customer.companyName}</TableCell>
                <TableCell>{po.project?.number ?? "-"}</TableCell>
                <TableCell>{formatCurrency(Number(po.poValue))}</TableCell>
                <TableCell>{formatDate(po.poDate)}</TableCell>
                <TableCell><Badge variant="outline">{displayLabel(po.status)}</Badge></TableCell>
                {(canEdit || canDelete) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {canEdit && <PoEditDialog po={po} />}
                      {canDelete && <PoRowActions id={po.id} number={po.number} />}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
