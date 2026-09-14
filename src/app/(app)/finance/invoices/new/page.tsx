import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { listUsersForPicker } from "@/server/settings/users";
import { InvoiceForm } from "@/components/finance/invoice-form";

export default async function NewInvoicePage() {
  const actor = await requireUser();
  requirePermission(actor.role, "finance", "create");

  const [customers, projects, contacts, salesUsers] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true, number: true }, orderBy: { companyName: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, customerId: true, number: true } }),
    prisma.contact.findMany({ select: { id: true, customerId: true, name: true } }),
    listUsersForPicker("SALES"),
  ]);

  return (
    <div className="space-y-4">
      <div><p className="workspace-eyebrow">Draf penagihan pelanggan</p><h1 className="text-xl font-semibold">Buat invoice</h1><p className="text-sm text-muted-foreground">Pilih pelanggan dan proyek agar hubungan datanya tersimpan otomatis.</p></div>
      <InvoiceForm customers={customers} projects={projects} contacts={contacts} salesUsers={salesUsers} />
    </div>
  );
}
