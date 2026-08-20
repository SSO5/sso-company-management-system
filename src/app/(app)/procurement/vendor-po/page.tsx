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

const NO_PROJECT_KEY = "__none__";

export default async function VendorPurchaseOrdersPage() {
  const actor = await requireUser();
  requirePermission(actor.role, "sales", "view");

  const pos = await listVendorPurchaseOrders();

  // Grouped by the real Project link (po.project), not the free-text
  // projectRef field printed on the PO document — this is "monitor the
  // whole purchasing process, but broken out per project" (spec), and a
  // free-text field typed differently PO to PO can't be trusted to group
  // correctly the way a real foreign key can.
  const byProject = new Map<string, { projectId: string | null; projectNumber: string; pos: typeof pos }>();
  for (const po of pos) {
    const key = po.projectId ?? NO_PROJECT_KEY;
    const group = byProject.get(key) ?? { projectId: po.projectId, projectNumber: po.project?.number ?? "Belum terhubung ke Project", pos: [] };
    group.pos.push(po);
    byProject.set(key, group);
  }
  const groups = Array.from(byProject.values()).sort((a, b) => {
    if (a.projectId === null) return 1;
    if (b.projectId === null) return -1;
    return a.projectNumber.localeCompare(b.projectNumber);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Procurement — Vendor Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">{pos.length} PO issued from SSO to suppliers / subcontractors, across {groups.length} project(s).</p>
        </div>
        <Link href="/procurement/vendor-po/new"><Button><Plus className="h-4 w-4" /> New Vendor PO</Button></Link>
      </div>

      {pos.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-8 text-center text-sm text-muted-foreground">No vendor purchase orders yet.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const groupTotal = g.pos.reduce((s, po) => s + Number(po.grandTotal), 0);
            return (
              <div key={g.projectId ?? NO_PROJECT_KEY} className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {g.projectId ? (
                      <Link href={`/projects/${g.projectId}`} className="hover:underline">{g.projectNumber}</Link>
                    ) : (
                      <span className="text-warning">{g.projectNumber}</span>
                    )}
                    <span className="text-xs font-normal text-muted-foreground">{g.pos.length} PO</span>
                  </div>
                  <span className="text-sm font-medium">{formatCurrency(groupTotal)}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>PO Date</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.pos.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">
                          <Link href={`/procurement/vendor-po/${po.id}`} className="hover:underline">{po.number}</Link>
                        </TableCell>
                        <TableCell>{po.vendorName}</TableCell>
                        <TableCell>{formatDate(po.poDate)}</TableCell>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
