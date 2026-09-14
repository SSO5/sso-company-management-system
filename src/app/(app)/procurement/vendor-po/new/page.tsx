import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { listUsersForPicker } from "@/server/settings/users";
import { VendorPoForm } from "@/components/sales/vendor-po-form";

export default async function NewVendorPoPage({ searchParams }: { searchParams: { projectId?: string } }) {
  const actor = await requireUser();
  requirePermission(actor.role, "sales", "create");

  const [customers, projects, users] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true, number: true }, orderBy: { companyName: "asc" } }),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        number: true,
        name: true,
        jobNumber: true,
        customerId: true,
        customer: { select: { companyName: true, address: true } },
        quotation: {
          select: {
            costingSheet: {
              select: {
                number: true,
                revision: true,
                sections: {
                  orderBy: { sortOrder: "asc" },
                  select: {
                    name: true,
                    items: {
                      orderBy: { sortOrder: "asc" },
                      select: { name: true, quantity: true, unit: true, costUnitPrice: true, supplierDiscountPercent: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    listUsersForPicker(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <p className="workspace-eyebrow">Draf dokumen pembelian</p>
        <h1 className="text-xl font-semibold">Buat PO vendor</h1>
        <p className="text-sm text-muted-foreground">Hubungkan dengan proyek agar nilai, dokumen, dan tindak lanjut dapat ditelusuri bersama.</p>
      </div>
      <VendorPoForm
        customers={customers}
        projects={projects.map((project) => ({
          id: project.id,
          number: project.number,
          name: project.name,
          jobNumber: project.jobNumber,
          customerId: project.customerId,
          customerName: project.customer.companyName,
          deliveryAddress: project.customer.address,
          costing: project.quotation?.costingSheet ? {
            number: project.quotation.costingSheet.number,
            revision: project.quotation.costingSheet.revision,
            items: project.quotation.costingSheet.sections.flatMap((section) =>
              section.items.map((item) => ({
                groupLabel: section.name,
                description: item.name,
                quantity: Number(item.quantity),
                unit: item.unit,
                unitPrice: Math.round(Number(item.costUnitPrice) * (1 - Number(item.supplierDiscountPercent) / 100) * 100) / 100,
              }))
            ),
          } : null,
        }))}
        users={users}
        defaultProjectId={searchParams.projectId}
      />
    </div>
  );
}
