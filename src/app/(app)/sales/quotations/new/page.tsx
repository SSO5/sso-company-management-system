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
    prisma.opportunity.findMany({ where: { deletedAt: null }, select: { id: true, customerId: true, number: true, name: true, salesPicId: true, contactId: true } }),
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
        <p className="workspace-eyebrow">Draf dokumen komersial</p>
        <h1 className="text-xl font-semibold">Buat penawaran</h1>
        <p className="text-sm text-muted-foreground">
          {lockedOpportunity
            ? `Untuk prospek ${lockedOpportunity.number} — ${lockedOpportunity.name}. Pelanggan, kontak, dan PIC diwarisi dari prospek.`
            : "Nilai per baris, pajak, dan total dihitung otomatis serta diperiksa kembali saat disimpan."}
        </p>
      </div>
      <QuotationForm
        customers={customers}
        contacts={contacts}
        opportunities={opportunities}
        salesUsers={salesUsers}
        signerUsers={allUsers}
        defaultValues={
          lockedOpportunity
            ? {
                customerId: lockedOpportunity.customerId,
                opportunityId: lockedOpportunity.id,
                // Inherit PIC/contact straight from the Opportunity — this
                // used to sit blank, forcing a reselect every single time
                // even though the deal already has an owner and a contact.
                salesPicId: lockedOpportunity.salesPicId ?? undefined,
                contactId: lockedOpportunity.contactId ?? undefined,
                subjectLine: lockedOpportunity.name,
                description: lockedOpportunity.name,
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              }
            : undefined
        }
      />
    </div>
  );
}
