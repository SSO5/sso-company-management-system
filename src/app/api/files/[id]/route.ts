import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getStorageDriver } from "@/lib/storage";

/**
 * The ONLY way to read a file's bytes (spec section 39). Changing the [id]
 * in the URL does not help an attacker: we re-check the session on every
 * request and (today) any authenticated user in one of the four roles may
 * read any non-trashed document, matching the spec's module-level
 * visibility (Sales/Finance/PM all see relevant docs read-only elsewhere).
 * If document-level ACLs are needed later, add the check right here before
 * calling driver.read() — this is the single choke point for all reads.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ?view=1 opens the file inline in the browser (PDF viewer, image, etc.)
  // instead of forcing a download — used by the "View" / "Print" buttons.
  // Printing is just the browser's native PDF viewer print button, so no
  // separate print endpoint is needed.
  const isInlineView = new URL(req.url).searchParams.get("view") === "1";

  try {
    const driver = getStorageDriver();
    const buffer = await driver.read(doc.storagePath);

    await prisma.activityLog.create({
      data: {
        userId: session.userId, action: "DOWNLOAD", entityType: "DOCUMENT", entityId: doc.id,
        description: `${isInlineView ? "Viewed" : "Downloaded"} "${doc.originalName}"`,
      },
    });

    const disposition = isInlineView ? "inline" : "attachment";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(doc.originalName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[file-download-error]", err);
    return NextResponse.json({ error: "Unable to retrieve file" }, { status: 500 });
  }
}
