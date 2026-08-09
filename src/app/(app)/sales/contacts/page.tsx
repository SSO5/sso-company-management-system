import { listContacts } from "@/server/sales/contacts";
import { listCustomers } from "@/server/sales/customers";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ContactFormDialog } from "@/components/sales/contact-form-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

export default async function ContactsPage() {
  const [contacts, customers] = await Promise.all([listContacts(), listCustomers()]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contact(s) across all customers</p>
        </div>
        <ContactFormDialog customers={customers} trigger={<Button><Plus className="h-4 w-4" /> New Contact</Button>} />
      </div>

      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet" description="Add a contact under a customer to reach decision makers directly." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((ct) => (
              <TableRow key={ct.id}>
                <TableCell className="font-medium">{ct.name} {ct.isPrimary && <Badge variant="outline" className="ml-1">Primary</Badge>}</TableCell>
                <TableCell>{ct.customer.companyName}</TableCell>
                <TableCell>{ct.position ?? "-"}</TableCell>
                <TableCell>{ct.email ?? "-"}</TableCell>
                <TableCell>{ct.phone ?? "-"}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
