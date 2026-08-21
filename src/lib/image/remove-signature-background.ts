import sharp from "sharp";

// Brightness band the fade operates over. A raw scan/photo of a signature on
// paper has soft, anti-aliased edges between ink and page — collapsing that
// straight to a hard 0/1 alpha cutoff leaves a jagged halo around every
// stroke, so pixels within the band get a proportionally faded alpha instead.
const WHITE_THRESHOLD = 235; // brightness at/above this -> fully transparent (paper)
const INK_THRESHOLD = 150; // brightness at/below this -> fully opaque (ink)

/**
 * Turns a signature (TTD) upload on a white/light paper background into a
 * transparent PNG, so it overlays cleanly on the company stamp on the
 * Quotation PDF instead of covering it with a white box.
 */
export async function removeSignatureBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    let alphaFactor: number;
    if (brightness >= WHITE_THRESHOLD) alphaFactor = 0;
    else if (brightness <= INK_THRESHOLD) alphaFactor = 1;
    else alphaFactor = 1 - (brightness - INK_THRESHOLD) / (WHITE_THRESHOLD - INK_THRESHOLD);
    data[i + 3] = Math.round(data[i + 3] * alphaFactor);
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}
