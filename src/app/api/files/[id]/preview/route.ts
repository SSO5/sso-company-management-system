import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage";
import { nativePreview, readOfficePreview } from "@/lib/document-preview";
export const maxDuration = 60;
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc || doc.deletedAt)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const kind = nativePreview(doc.mimeType);
  if (kind) return NextResponse.json({ kind }, { headers });
  try {
    if (doc.fileSize > 12 * 1024 * 1024)
      return NextResponse.json(
        {
          kind: "file",
          note: "File terlalu besar untuk pratinjau isi. Unduh file asli.",
        },
        { headers },
      );
    const buffer = await getStorageDriver().read(doc.storagePath);
    return NextResponse.json(
      await readOfficePreview(buffer, doc.originalName),
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        kind: "file",
        note: "Dokumen tidak dapat dirender dengan aman atau terlindungi sandi. Gunakan unduhan file asli.",
      },
      { headers },
    );
  }
}
