import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { InvoiceForm } from "@/components/finance/invoice-form";

export default async function NewInvoicePage() {
  const actor = await requireUser();
  requirePermission(actor.role, "finance", "create");

  const [customers, projects] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true, number: true }, orderBy: { companyName: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, customerId: true, number: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">New Invoice</h1><p className="text-sm text-muted-foreground">Automatically linked to the selected customer and project.</p></div>
      <InvoiceForm customers={customers} projects={projects} />
    </div>
  );
}
