import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { getCostingSheet } from "@/server/sales/costing";
import { CostingForm } from "@/components/sales/costing-form";

export default async function EditCostingPage({ params }: { params: { id: string } }) {
  const actor = await requireUser();
  requirePermission(actor.role, "sales", "update");

  const [sheet, customers, opportunities] = await Promise.all([
    getCostingSheet(params.id),
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true, number: true }, orderBy: { companyName: "asc" } }),
    prisma.opportunity.findMany({ where: { deletedAt: null }, select: { id: true, customerId: true, number: true, name: true } }),
  ]);
  if (!sheet) notFound();
  if (sheet.status === "CONVERTED") notFound(); // locked — see costing.ts: cannot edit a converted sheet

  const defaultValues = {
    customerId: sheet.customerId,
    opportunityId: sheet.opportunityId,
    projectTitle: sheet.projectTitle,
    jobNo: sheet.jobNo,
    costingDate: sheet.costingDate,
    notes: sheet.notes,
    operationalCost: Number(sheet.operationalCost),
    ppnPercent: Number(sheet.ppnPercent),
    pphFinalPercent: Number(sheet.pphFinalPercent),
    sections: sheet.sections.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      items: s.items.map((i) => ({
        id: i.id,
        groupLabel: i.groupLabel,
        name: i.name,
        description: i.description,
        quantity: Number(i.quantity),
        unit: i.unit,
        currency: i.currency,
        costUnitPrice: Number(i.costUnitPrice),
        supplierDiscountPercent: Number(i.supplierDiscountPercent),
        marginPercent: Number(i.marginPercent),
      })),
    })),
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Edit Costing Sheet — {sheet.number}</h1>
        <p className="text-sm text-muted-foreground">Changes recompute all totals on save.</p>
      </div>
      <CostingForm customers={customers} opportunities={opportunities} costingId={sheet.id} defaultValues={defaultValues} />
    </div>
  );
}
