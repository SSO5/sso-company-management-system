import { PDFDocument, PDFName, PDFDict, PDFRef, PDFRawStream } from "pdf-lib";

/**
 * Pulls the real content photos out of an uploaded inspection-report PDF, so
 * an AI-generated Progress Report can carry the same photos the source
 * document shows per checkpoint — not just the extracted text.
 *
 * Only JPEG-encoded image XObjects (filter DCTDecode) are extracted, since
 * that's what every real-world "photo pasted into a Word/report doc" is
 * saved as — the raw stream bytes ARE already a valid .jpg, no decoding
 * needed. A width/height floor (40px) throws out the tiny image slivers a
 * PDF exporter emits for table borders/shading, which are never real
 * content — verified against a real SSO inspection report where dozens of
 * ~200x10px slivers sat alongside the genuine ~150-300px equipment photos.
 *
 * Images are returned in page order, and in the order pdf-lib's resource
 * dictionary lists them — a heuristic, not a guaranteed visual order, but
 * the closest approximation available without a full content-stream
 * operator parse. Good enough to pair with extractProgressReport's own
 * per-item photoCount to distribute photos across checklist items in
 * document order.
 */
const MIN_DIMENSION_PX = 40;

export async function extractEmbeddedPhotos(buffer: Buffer): Promise<Buffer[]> {
  let pdf;
  try {
    pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    return [];
  }

  const photos: Buffer[] = [];
  for (const page of pdf.getPages()) {
    const resources = page.node.Resources();
    if (!resources) continue;
    const xobjectsRef = resources.get(PDFName.of("XObject"));
    if (!xobjectsRef) continue;
    const xobjects = pdf.context.lookup(xobjectsRef, PDFDict);

    for (const [, ref] of xobjects.entries()) {
      const stream = pdf.context.lookup(ref as PDFRef);
      if (!(stream instanceof PDFRawStream)) continue;
      const dict = stream.dict;
      if (dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;

      const filter = dict.get(PDFName.of("Filter"))?.toString() ?? "";
      if (!filter.includes("DCTDecode")) continue;

      const width = Number(dict.get(PDFName.of("Width"))?.toString() ?? 0);
      const height = Number(dict.get(PDFName.of("Height"))?.toString() ?? 0);
      if (width < MIN_DIMENSION_PX || height < MIN_DIMENSION_PX) continue;

      photos.push(Buffer.from(stream.contents));
    }
  }
  return photos;
}
