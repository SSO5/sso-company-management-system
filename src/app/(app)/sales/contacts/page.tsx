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
          <p className="workspace-eyebrow">Orang yang dapat dihubungi</p>
          <h1 className="text-xl font-semibold">Kontak pelanggan</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} kontak dari seluruh pelanggan</p>
        </div>
        <ContactFormDialog customers={customers} trigger={<Button><Plus className="h-4 w-4" /> Tambah kontak</Button>} />
      </div>

      {contacts.length === 0 ? (
        <EmptyState title="Belum ada kontak" description="Tambahkan orang yang dapat dihubungi pada perusahaan pelanggan." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead>Jabatan</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telepon</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((ct) => (
              <TableRow key={ct.id}>
                <TableCell className="font-medium">{ct.name} {ct.isPrimary && <Badge variant="outline" className="ml-1">Utama</Badge>}</TableCell>
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
