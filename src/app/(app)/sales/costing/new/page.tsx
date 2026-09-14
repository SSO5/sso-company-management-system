import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { CostingForm } from "@/components/sales/costing-form";

export default async function NewCostingPage({ searchParams }: { searchParams: { opportunityId?: string } }) {
  const actor = await requireUser();
  requirePermission(actor.role, "sales", "create");

  const [customers, opportunities] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true, number: true }, orderBy: { companyName: "asc" } }),
    prisma.opportunity.findMany({ where: { deletedAt: null }, select: { id: true, customerId: true, number: true, name: true } }),
  ]);

  // Coming from an Opportunity's own "4. Costing" folder — pre-fill Customer
  // + Opportunity (spec: costing is created per-prospect from inside that folder).
  const lockedOpportunity = searchParams.opportunityId
    ? opportunities.find((o) => o.id === searchParams.opportunityId)
    : undefined;

  return (
    <div className="space-y-4">
      <div>
        <p className="workspace-eyebrow">Dasar penawaran</p>
        <h1 className="text-xl font-semibold">Buat perhitungan biaya</h1>
        <p className="text-sm text-muted-foreground">
          {lockedOpportunity
            ? `Untuk prospek ${lockedOpportunity.number} — ${lockedOpportunity.name}. `
            : ""}
          Tambahkan kelompok dan rincian biaya. Harga jual dihitung otomatis dari biaya dan margin.
        </p>
      </div>
      <CostingForm
        customers={customers}
        opportunities={opportunities}
        defaultValues={lockedOpportunity ? { customerId: lockedOpportunity.customerId, opportunityId: lockedOpportunity.id } : undefined}
      />
    </div>
  );
}
