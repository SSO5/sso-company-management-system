import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getStorageDriver } from "@/lib/storage";
import { prisma } from "@/lib/db";

/**
 * Serves Progress Report before/after photos (see
 * lib/workflows/progress-report.ts). Same "never under /public,
 * session-gated on every request" rule as every other private file in this
 * app (api/files/[id], api/branding/[...key]). The storage key here is the
 * driver's own randomly-generated key (ProgressReportItem.photoBeforeKey /
 * photoAfterKey), not a branding-style stable prefix, so this reads through
 * the plain StorageDriver rather than readBrandingAsset().
 */
export async function GET(req: Request, { params }: { params: { key: string[] } }) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storageKey = params.key.join("/");
  const item = await prisma.progressReportItem.findFirst({
    where: { progressReport: { deletedAt: null }, OR: [{ photoBeforeKey: storageKey }, { photoAfterKey: storageKey }] },
    select: { id: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let buffer: Buffer;
  try {
    buffer = await getStorageDriver().read(storageKey);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = storageKey.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";

  return new NextResponse(buffer, {
    headers: { "Content-Type": contentType, "Cache-Control": "private, no-store" },
  });
}
