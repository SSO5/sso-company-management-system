import { listPurchaseOrders } from "@/server/sales/purchase-orders";
import { listCustomers } from "@/server/sales/customers";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PurchaseOrderFormDialog } from "@/components/sales/po-form-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

export default async function PurchaseOrdersPage() {
  const [pos, customers, projects] = await Promise.all([
    listPurchaseOrders(), listCustomers(),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, number: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Purchase Orders</h1><p className="text-sm text-muted-foreground">{pos.length} PO(s)</p></div>
        <PurchaseOrderFormDialog customers={customers} projects={projects} trigger={<Button><Plus className="h-4 w-4" /> New PO</Button>} />
      </div>
      {pos.length === 0 ? <EmptyState title="No purchase orders yet" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Customer</TableHead><TableHead>Project</TableHead><TableHead>Value</TableHead><TableHead>PO Date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {pos.map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-mono text-xs">{po.number}</TableCell>
                <TableCell>{po.customer.companyName}</TableCell>
                <TableCell>{po.project?.number ?? "-"}</TableCell>
                <TableCell>{formatCurrency(Number(po.poValue))}</TableCell>
                <TableCell>{formatDate(po.poDate)}</TableCell>
                <TableCell><Badge variant="outline">{po.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
