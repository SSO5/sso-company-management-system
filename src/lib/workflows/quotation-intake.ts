import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { createOpportunityFolders } from "@/lib/workflows/folders";
import { logActivity } from "@/lib/workflows/audit";
import type { QuotationIntakeInput } from "@/lib/validation/numbering";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * The "Ambil Nomor QUO" shortcut (spec: taking a Quotation number should
 * auto-fill Customer, Contact, and Opportunity). Find-or-create Customer by
 * company name, find-or-create Contact under it (updating phone/email if
 * new info is supplied), then create the Opportunity + its 6 folders. The
 * caller redirects into /sales/quotations/new?opportunityId=... afterward —
 * that is where the real QUO number gets issued, once actual line items
 * exist (see createQuotation in lib/workflows/quotation.ts).
 */
export async function createQuotationIntake(input: QuotationIntakeInput, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({
      where: { companyName: { equals: input.customerName.trim(), mode: "insensitive" }, deletedAt: null },
    });
    if (!customer) {
      const number = await generateNumber(tx, "CUSTOMER");
      customer = await tx.customer.create({
        data: {
          number, companyName: input.customerName.trim(), customerType: "PROSPECT",
          status: "ACTIVE", createdById: actor.userId,
        },
      });
    }

    let contact = null;
    if (input.contactName?.trim()) {
      contact = await tx.contact.findFirst({
        where: { customerId: customer.id, name: { equals: input.contactName.trim(), mode: "insensitive" } },
      });
      if (!contact) {
        contact = await tx.contact.create({
          data: {
            customerId: customer.id, name: input.contactName.trim(),
            phone: input.contactPhone || null, email: input.contactEmail || null,
            isPrimary: true,
          },
        });
      } else if (input.contactPhone || input.contactEmail) {
        contact = await tx.contact.update({
          where: { id: contact.id },
          data: { phone: input.contactPhone || contact.phone, email: input.contactEmail || contact.email },
        });
      }
    }

    const oppNumber = await generateNumber(tx, "OPPORTUNITY");
    const opportunity = await tx.opportunity.create({
      data: {
        number: oppNumber, customerId: customer.id, contactId: contact?.id,
        name: input.subject, estimatedValue: 0, probability: 10,
        salesPicId: actor.userId, status: "NEW",
      },
      include: { customer: { select: { companyName: true } } },
    });
    await createOpportunityFolders(tx, opportunity, opportunity.customer.companyName);

    await logActivity(tx, {
      userId: actor.userId,
      action: "CREATE",
      entityType: "OPPORTUNITY",
      entityId: opportunity.id,
      description: `${opportunity.number} dibuat lewat "Ambil Nomor Quotation" untuk ${customer.companyName}`,
    });

    return {
      customerId: customer.id,
      contactId: contact?.id,
      opportunityId: opportunity.id,
      opportunityNumber: opportunity.number,
      customerName: customer.companyName,
    };
  });
}
