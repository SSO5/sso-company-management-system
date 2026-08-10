import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { listVendorPurchaseOrders } from "@/server/sales/vendor-purchase-orders";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, FileDown } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SENT: "Sent",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

export default async function VendorPurchaseOrdersPage() {
  const actor = await requireUser();
  requirePermission(actor.role, "sales", "view");

  const pos = await listVendorPurchaseOrders();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Vendor Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">PO issued from SSO to suppliers / subcontractors.</p>
        </div>
        <Link href="/procurement/vendor-po/new"><Button><Plus className="h-4 w-4" /> New Vendor PO</Button></Link>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>PO Date</TableHead>
              <TableHead>Project Ref.</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pos.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No vendor purchase orders yet.</TableCell></TableRow>
            )}
            {pos.map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-medium">
                  <Link href={`/procurement/vendor-po/${po.id}`} className="hover:underline">{po.number}</Link>
                </TableCell>
                <TableCell>{po.vendorName}</TableCell>
                <TableCell>{formatDate(po.poDate)}</TableCell>
                <TableCell>{po.projectRef ?? "—"}</TableCell>
                <TableCell>{formatCurrency(Number(po.grandTotal))}</TableCell>
                <TableCell>{STATUS_LABEL[po.status] ?? po.status}</TableCell>
                <TableCell className="text-right">
                  <a href={`/api/procurement/vendor-po/${po.id}/pdf`} target="_blank" rel="noreferrer">
                    <Button size="icon" variant="ghost"><FileDown className="h-4 w-4" /></Button>
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
