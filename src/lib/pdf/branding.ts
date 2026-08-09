import { readBrandingAsset } from "@/lib/storage";
import { imageFormatFromKey } from "@/lib/pdf/format";

export interface PdfImageSrc {
  data: Buffer;
  format: "png" | "jpg";
}

/** Loads a branding asset (logo / stamp / a user's signature) from private
 * storage and shapes it into the { data, format } object @react-pdf/renderer
 * expects for its <Image> component. Returns null if not uploaded yet —
 * every PDF template must render gracefully without it (no broken image). */
export async function loadPdfImage(key: string | null | undefined): Promise<PdfImageSrc | null> {
  const format = imageFormatFromKey(key);
  if (!format) return null;
  const buffer = await readBrandingAsset(key);
  if (!buffer) return null;
  return { data: buffer, format };
}
