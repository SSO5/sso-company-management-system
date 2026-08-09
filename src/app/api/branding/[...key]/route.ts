import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readBrandingAsset } from "@/lib/storage";

/**
 * Serves branding assets (user signatures, company logo/stamp) for preview
 * inside Settings screens — e.g. showing a user's currently-uploaded TTD
 * next to the upload button. Same "never under /public" rule as regular
 * Documents (see api/files/[id]/route.ts): every request re-checks the
 * session first. These are low-sensitivity internal images (a signature
 * scan, a company logo), so any signed-in user may view any of them — there
 * is no per-user ACL here, unlike Documents.
 */
export async function GET(req: Request, { params }: { params: { key: string[] } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const relativeKey = `branding/${params.key.join("/")}`;
  const buffer = await readBrandingAsset(relativeKey);
  if (!buffer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = relativeKey.split(".").pop()?.toLowerCase();
  const contentType = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";

  return new NextResponse(buffer, {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=60" },
  });
}
