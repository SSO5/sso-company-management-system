import Link from "next/link";
import { listCustomers } from "@/server/sales/customers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerFormDialog } from "@/components/sales/customer-form-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { displayLabel } from "@/lib/display-labels";

export default async function CustomersPage() {
  const customers = await listCustomers();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="workspace-eyebrow">Basis relasi pelanggan</p>
          <h1 className="text-xl font-semibold">Pelanggan &amp; Kontak</h1>
          <p className="text-sm text-muted-foreground">{customers.length} perusahaan tersimpan</p>
        </div>
        <CustomerFormDialog trigger={<Button><Plus className="h-4 w-4" /> Tambah pelanggan</Button>} />
      </div>

      {customers.length === 0 ? (
        <EmptyState title="Belum ada pelanggan" description="Tambahkan perusahaan agar dapat digunakan kembali pada prospek, penawaran, proyek, dan invoice." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor</TableHead>
              <TableHead>Perusahaan</TableHead>
              <TableHead>Hubungan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Prospek</TableHead>
              <TableHead>Penawaran</TableHead>
              <TableHead>Proyek</TableHead>
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
                <TableCell>{displayLabel(c.customerType)}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>{displayLabel(c.status)}</Badge>
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
