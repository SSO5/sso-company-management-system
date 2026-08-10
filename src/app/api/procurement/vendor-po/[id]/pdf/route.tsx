import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { loadPdfImage } from "@/lib/pdf/branding";
import { VendorPoPdfDocument } from "@/lib/pdf/vendor-po-document";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const po = await prisma.vendorPurchaseOrder.findUnique({
    where: { id: params.id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      signer: { select: { name: true, title: true, signatureImageUrl: true } },
    },
  });
  if (!po) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: "singleton" } });
  const [logo, signature, stamp] = await Promise.all([
    loadPdfImage(settings?.logoUrl),
    loadPdfImage(po.signer?.signatureImageUrl),
    loadPdfImage(settings?.stampImageUrl),
  ]);

  try {
    const buffer = await renderToBuffer(
      <VendorPoPdfDocument
        po={{
          number: po.number,
          poDate: po.poDate,
          quotationRef: po.quotationRef,
          projectRef: po.projectRef,
          paymentTerms: po.paymentTerms,
          deliveryTerms: po.deliveryTerms,
          vendorName: po.vendorName,
          vendorAddress: po.vendorAddress,
          vendorEmail: po.vendorEmail,
          vendorAttn: po.vendorAttn,
          deliveryName: po.deliveryName,
          deliveryAddress: po.deliveryAddress,
          deliveryAttn: po.deliveryAttn,
          items: po.items.map((i) => ({
            groupLabel: i.groupLabel,
            description: i.description,
            quantity: Number(i.quantity),
            unit: i.unit,
            unitPrice: Number(i.unitPrice),
            amount: Number(i.amount),
          })),
          subtotal: Number(po.subtotal),
          discount: Number(po.discount),
          taxPercent: Number(po.taxPercent),
          tax: Number(po.tax),
          grandTotal: Number(po.grandTotal),
          notes: po.notes,
        }}
        company={{
          companyName: settings?.companyName || "PT Sarana Sinergi Optima",
          address: settings?.address ?? null,
          addressLine2: settings?.addressLine2 ?? null,
          city: settings?.city ?? null,
          province: settings?.province ?? null,
          phone: settings?.phone ?? null,
        }}
        signer={{ name: po.signer?.name ?? "", title: po.signer?.title ?? null }}
        logo={logo}
        signature={signature}
        stamp={stamp}
      />
    );

    const isInlineView = new URL(req.url).searchParams.get("view") === "1";
    const safeFileName = `${po.number.replace(/[\\/]/g, "-")}.pdf`;

    await prisma.activityLog.create({
      data: {
        userId: session.userId, action: "DOWNLOAD", entityType: "VENDOR_PO", entityId: po.id,
        description: `${isInlineView ? "Viewed" : "Downloaded"} PDF for ${po.number}`,
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
    console.error("[vendor-po-pdf-error]", err);
    return NextResponse.json({ error: "Unable to generate PDF" }, { status: 500 });
  }
}
