import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { listUsersForPicker } from "@/server/settings/users";
import { VendorPoForm } from "@/components/sales/vendor-po-form";

export default async function NewVendorPoPage() {
  const actor = await requireUser();
  requirePermission(actor.role, "sales", "create");

  const [customers, projects, users] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true, number: true }, orderBy: { companyName: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, number: true } }),
    listUsersForPicker(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">New Vendor Purchase Order</h1>
        <p className="text-sm text-muted-foreground">Issued by SSO to a supplier or subcontractor.</p>
      </div>
      <VendorPoForm customers={customers} projects={projects} users={users} />
    </div>
  );
}
