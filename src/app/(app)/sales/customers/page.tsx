import Link from "next/link";
import { listCustomers } from "@/server/sales/customers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerFormDialog } from "@/components/sales/customer-form-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";

export default async function CustomersPage() {
  const customers = await listCustomers();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers.length} customer(s)</p>
        </div>
        <CustomerFormDialog trigger={<Button><Plus className="h-4 w-4" /> New Customer</Button>} />
      </div>

      {customers.length === 0 ? (
        <EmptyState title="No customers yet" description="Create your first customer to start the sales pipeline." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opportunities</TableHead>
              <TableHead>Quotations</TableHead>
              <TableHead>Projects</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/sales/customers/${c.id}`} className="hover:underline">{c.number}</Link>
                </TableCell>
                <TableCell>
                  <Link href={`/sales/customers/${c.id}`} className="font-medium hover:underline">{c.companyName}</Link>
                </TableCell>
                <TableCell>{c.customerType}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>{c.status}</Badge>
                </TableCell>
                <TableCell>{c._count.opportunities}</TableCell>
                <TableCell>{c._count.quotations}</TableCell>
                <TableCell>{c._count.projects}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
