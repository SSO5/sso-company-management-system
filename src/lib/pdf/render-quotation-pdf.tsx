import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { loadPdfImage } from "@/lib/pdf/branding";
import { QuotationPdfDocument } from "@/lib/pdf/quotation-document";
import { formatRevisedNumber } from "@/lib/utils";
import type { QuotationSnapshot } from "@/lib/workflows/revision-history";

export class QuotationPdfNotFoundError extends Error {}

/**
 * Shared by app/api/quotations/[id]/pdf/route.tsx (browser download/view,
 * auth via session cookie) and the Telegram automation flow (auth via
 * resolved chat actor, no cookie) — both need the exact same PDF bytes, so
 * this holds the one copy of "how a Quotation becomes a PDF" instead of
 * letting the two callers drift apart. Callers own their own auth check and
 * activity logging; this only renders.
 */
export async function renderQuotationPdf(quotationId: string, revision?: number): Promise<{ buffer: Buffer; fileName: string }> {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: true,
      contact: true,
      items: { orderBy: { sortOrder: "asc" } },
      signer: { select: { name: true, title: true, signatureImageUrl: true } },
      salesPic: { select: { name: true, title: true, signatureImageUrl: true } },
    },
  });
  if (!quotation) throw new QuotationPdfNotFoundError("Quotation not found.");

  const requestedRevision = revision ?? quotation.revision;
  if (!Number.isInteger(requestedRevision) || requestedRevision < 0) {
    throw new QuotationPdfNotFoundError("Invalid revision.");
  }

  let quotationForPdf = {
    number: formatRevisedNumber(quotation.number, quotation.revision),
    quotationDate: quotation.quotationDate,
    subjectLine: quotation.subjectLine,
    description: quotation.description,
    commercialTerms: (quotation.commercialTerms as { title: string; body: string }[] | null) ?? null,
    items: quotation.items.map((i) => ({
      itemName: i.itemName,
      description: i.description,
      technicalSpec: i.technicalSpec,
      quantity: Number(i.quantity),
      unit: i.unit,
      unitPrice: Number(i.unitPrice),
      total: Number(i.total),
    })),
    grandTotal: Number(quotation.grandTotal),
  };

  if (requestedRevision !== quotation.revision) {
    const historyRow = await prisma.quotationRevisionHistory.findUnique({
      where: { quotationId_revision: { quotationId: quotation.id, revision: requestedRevision } },
    });
    if (!historyRow) throw new QuotationPdfNotFoundError("Revision not found.");
    const snap = historyRow.snapshot as unknown as QuotationSnapshot;
    quotationForPdf = {
      number: formatRevisedNumber(quotation.number, requestedRevision),
      quotationDate: snap.quotationDate ? new Date(snap.quotationDate) : quotation.quotationDate,
      subjectLine: snap.subjectLine !== undefined ? snap.subjectLine : quotation.subjectLine,
      description: snap.description,
      commercialTerms: snap.commercialTerms !== undefined ? snap.commercialTerms : quotationForPdf.commercialTerms,
      items: snap.items.map((i) => ({
        itemName: i.itemName,
        description: i.description,
        technicalSpec: i.technicalSpec,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        total: i.total,
      })),
      grandTotal: snap.grandTotal,
    };
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: "singleton" } });
  const signerUser = quotation.signer || quotation.salesPic;

  const [logo, signature, stamp] = await Promise.all([
    loadPdfImage(settings?.logoUrl),
    loadPdfImage(signerUser.signatureImageUrl),
    loadPdfImage(settings?.stampImageUrl),
  ]);

  const buffer = await renderToBuffer(
    <QuotationPdfDocument
      quotation={quotationForPdf}
      customer={{ companyName: quotation.customer.companyName }}
      contact={quotation.contact ? { salutation: quotation.contact.salutation, name: quotation.contact.name, position: quotation.contact.position } : null}
      company={{
        companyName: settings?.companyName || "PT Sarana Sinergi Optima",
        address: settings?.address ?? null,
        addressLine2: settings?.addressLine2 ?? null,
        city: settings?.city ?? null,
        province: settings?.province ?? null,
        phone: settings?.phone ?? null,
      }}
      signer={{ name: signerUser.name, title: signerUser.title }}
      logo={logo}
      signature={signature}
      stamp={stamp}
    />
  );

  const fileName = `${quotationForPdf.number.replace(/[\\/]/g, "-")}.pdf`;
  return { buffer, fileName };
}
