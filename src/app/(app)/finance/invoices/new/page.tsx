import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { listUsersForPicker } from "@/server/settings/users";
import { InvoiceForm } from "@/components/finance/invoice-form";

export default async function NewInvoicePage({ searchParams }: { searchParams: { projectId?: string } }) {
  const actor = await requireUser();
  requirePermission(actor.role, "finance", "create");

  const [customers, projects, contacts, salesUsers] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true, number: true }, orderBy: { companyName: "asc" } }),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        customerId: true,
        number: true,
        name: true,
        jobNumber: true,
        salesPicId: true,
        quotation: {
          select: {
            id: true,
            number: true,
            contactId: true,
            items: { orderBy: { sortOrder: "asc" }, select: { itemName: true, quantity: true, unit: true, unitPrice: true, taxPercent: true } },
          },
        },
        purchaseOrders: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { number: true, poDate: true, estimatedDeliveryDate: true, paymentTerms: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact.findMany({ select: { id: true, customerId: true, name: true } }),
    listUsersForPicker("SALES"),
  ]);

  return (
    <div className="space-y-4">
      <div><p className="workspace-eyebrow">Draf penagihan pelanggan</p><h1 className="text-xl font-semibold">Buat invoice</h1><p className="text-sm text-muted-foreground">Pilih pelanggan dan proyek agar hubungan datanya tersimpan otomatis.</p></div>
      <InvoiceForm
        customers={customers}
        projects={projects.map((project) => ({
          ...project,
          quotation: project.quotation ? {
            ...project.quotation,
            items: project.quotation.items.map((item) => ({
              ...item,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              taxPercent: Number(item.taxPercent),
            })),
          } : null,
        }))}
        contacts={contacts}
        salesUsers={salesUsers}
        defaultProjectId={searchParams.projectId}
      />
    </div>
  );
}
