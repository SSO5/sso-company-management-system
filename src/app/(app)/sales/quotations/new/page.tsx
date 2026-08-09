import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { listUsersForPicker } from "@/server/settings/users";
import { QuotationForm } from "@/components/sales/quotation-form";

export default async function NewQuotationPage({ searchParams }: { searchParams: { opportunityId?: string } }) {
  const actor = await requireUser();
  requirePermission(actor.role, "sales", "create");

  const [customers, contacts, opportunities, salesUsers, allUsers] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true, number: true }, orderBy: { companyName: "asc" } }),
    prisma.contact.findMany({ select: { id: true, customerId: true, name: true } }),
    prisma.opportunity.findMany({ where: { deletedAt: null }, select: { id: true, customerId: true, number: true, name: true } }),
    listUsersForPicker("SALES"),
    listUsersForPicker(),
  ]);

  // Coming from an Opportunity's own "5. Quotation" folder (spec: quotations
  // are created per-prospect from inside that folder) — pre-fill Customer +
  // Opportunity so the sales rep doesn't have to look them up again.
  const lockedOpportunity = searchParams.opportunityId
    ? opportunities.find((o) => o.id === searchParams.opportunityId)
    : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">New Quotation</h1>
        <p className="text-sm text-muted-foreground">
          {lockedOpportunity
            ? `For opportunity ${lockedOpportunity.number} — ${lockedOpportunity.name}. Totals are calculated automatically and re-verified server-side on save.`
            : "Totals are calculated automatically and re-verified server-side on save."}
        </p>
      </div>
      <QuotationForm
        customers={customers}
        contacts={contacts}
        opportunities={opportunities}
        salesUsers={salesUsers}
        signerUsers={allUsers}
        defaultValues={lockedOpportunity ? { customerId: lockedOpportunity.customerId, opportunityId: lockedOpportunity.id } : undefined}
      />
    </div>
  );
}
