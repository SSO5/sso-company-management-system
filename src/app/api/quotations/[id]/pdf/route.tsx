import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { loadPdfImage } from "@/lib/pdf/branding";
import { QuotationPdfDocument } from "@/lib/pdf/quotation-document";
import { formatRevisedNumber } from "@/lib/utils";

/**
 * Streams the Quotation PDF matching SSO's SOP template. ?view=1 opens
 * inline in the browser (View / Print buttons); without it, downloads.
 * Auth is re-checked here — same choke-point pattern as /api/files/[id].
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quotation = await prisma.quotation.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      contact: true,
      items: { orderBy: { sortOrder: "asc" } },
      signer: { select: { name: true, title: true, signatureImageUrl: true } },
      salesPic: { select: { name: true, title: true, signatureImageUrl: true } },
    },
  });
  if (!quotation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: "singleton" } });
  const signerUser = quotation.signer || quotation.salesPic;

  const [logo, signature, stamp] = await Promise.all([
    loadPdfImage(settings?.logoUrl),
    loadPdfImage(signerUser.signatureImageUrl),
    loadPdfImage(settings?.stampImageUrl),
  ]);

  try {
    const buffer = await renderToBuffer(
      <QuotationPdfDocument
        quotation={{
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
        }}
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

    const isInlineView = new URL(req.url).searchParams.get("view") === "1";
    const displayNumber = formatRevisedNumber(quotation.number, quotation.revision);
    const safeFileName = `${displayNumber.replace(/[\\/]/g, "-")}.pdf`;

    await prisma.activityLog.create({
      data: {
        userId: session.userId, action: "DOWNLOAD", entityType: "QUOTATION", entityId: quotation.id,
        description: `${isInlineView ? "Viewed" : "Downloaded"} PDF for ${displayNumber}`,
      },
    });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isInlineView ? "inline" : "attachment"}; filename="${safeFileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[quotation-pdf-error]", err);
    return NextResponse.json({ error: "Unable to generate PDF" }, { status: 500 });
  }
}
