import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { getQuotation } from "@/server/sales/quotations";
import { listUsersForPicker } from "@/server/settings/users";
import { QuotationForm } from "@/components/sales/quotation-form";
import type { CommercialTermItem } from "@/lib/validation/sales";

export default async function EditQuotationPage({ params }: { params: { id: string } }) {
  const actor = await requireUser();
  requirePermission(actor.role, "sales", "update");

  const [q, customers, contacts, opportunities, salesUsers, allUsers] = await Promise.all([
    getQuotation(params.id),
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true, number: true }, orderBy: { companyName: "asc" } }),
    prisma.contact.findMany({ select: { id: true, customerId: true, name: true } }),
    prisma.opportunity.findMany({ where: { deletedAt: null }, select: { id: true, customerId: true, number: true, name: true } }),
    listUsersForPicker("SALES"),
    listUsersForPicker(),
  ]);
  if (!q) notFound();
  // Only DRAFT is editable — matches the guard in updateQuotation (once
  // submitted, isLocked freezes commercial terms per the approval-integrity
  // rule). Land back on the read-only detail page instead of erroring.
  if (q.status !== "DRAFT") notFound();

  const defaultValues = {
    customerId: q.customerId,
    contactId: q.contactId,
    opportunityId: q.opportunityId,
    quotationDate: q.quotationDate,
    validUntil: q.validUntil,
    salesPicId: q.salesPicId,
    signerId: q.signerId,
    description: q.description,
    subjectLine: q.subjectLine,
    notes: q.notes,
    commercialTerms: (q.commercialTerms as CommercialTermItem[] | null) ?? undefined,
    discount: Number(q.discount),
    items: q.items.map((i) => ({
      itemName: i.itemName,
      description: i.description,
      technicalSpec: i.technicalSpec,
      quantity: Number(i.quantity),
      unit: i.unit,
      unitPrice: Number(i.unitPrice),
      discountPercent: Number(i.discountPercent),
      taxPercent: Number(i.taxPercent),
    })),
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Edit Quotation — {q.number}</h1>
        <p className="text-sm text-muted-foreground">
          Tinjau semua field termasuk Commercial Provisions sebelum submit — terutama jika quotation ini dibuat otomatis dari Costing Sheet.
        </p>
      </div>
      <QuotationForm
        quotationId={q.id}
        customers={customers}
        contacts={contacts}
        opportunities={opportunities}
        salesUsers={salesUsers}
        signerUsers={allUsers}
        defaultValues={defaultValues}
      />
    </div>
  );
}
