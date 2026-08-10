import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { loadPdfImage } from "@/lib/pdf/branding";
import { InvoicePdfDocument } from "@/lib/pdf/invoice-document";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      contact: { select: { name: true } },
      salesPic: { select: { name: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: "singleton" } });
  const [logo, stamp] = await Promise.all([
    loadPdfImage(settings?.logoUrl),
    loadPdfImage(settings?.stampImageUrl),
  ]);

  try {
    const buffer = await renderToBuffer(
      <InvoicePdfDocument
        invoice={{
          number: invoice.number,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          customerPO: invoice.customerPO,
          poDate: invoice.poDate,
          deliveryDate: invoice.deliveryDate,
          jobNo: invoice.jobNo,
          salesPicName: invoice.salesPic?.name ?? null,
          items: invoice.items.map((i) => ({
            groupLabel: i.groupLabel,
            description: i.description,
            quantity: Number(i.quantity),
            unit: i.unit,
            unitPrice: Number(i.unitPrice),
            total: Number(i.total),
            isNote: i.isNote,
          })),
          subtotal: Number(invoice.subtotal),
          discount: Number(invoice.discount),
          tax: Number(invoice.tax),
          grandTotal: Number(invoice.grandTotal),
          dpPercent: invoice.dpPercent ? Number(invoice.dpPercent) : null,
          notes: invoice.notes,
        }}
        customer={{ companyName: invoice.customer.companyName, address: invoice.customer.address, phone: invoice.customer.phone }}
        contactName={invoice.contact?.name ?? null}
        company={{
          companyName: settings?.companyName || "PT Sarana Sinergi Optima",
          address: settings?.address ?? null,
          addressLine2: settings?.addressLine2 ?? null,
          city: settings?.city ?? null,
          province: settings?.province ?? null,
          phone: settings?.phone ?? null,
        }}
        bank={{
          bankName: settings?.bankName ?? null,
          bankBranch: settings?.bankBranch ?? null,
          bankAccountName: settings?.bankAccountName ?? null,
          bankAccountNumber: settings?.bankAccountNumber ?? null,
        }}
        logo={logo}
        stamp={stamp}
      />
    );

    const isInlineView = new URL(req.url).searchParams.get("view") === "1";
    const safeFileName = `${invoice.number.replace(/[\\/]/g, "-")}.pdf`;

    await prisma.activityLog.create({
      data: {
        userId: session.userId, action: "DOWNLOAD", entityType: "INVOICE", entityId: invoice.id,
        description: `${isInlineView ? "Viewed" : "Downloaded"} PDF for ${invoice.number}`,
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
    console.error("[invoice-pdf-error]", err);
    return NextResponse.json({ error: "Unable to generate PDF" }, { status: 500 });
  }
}
