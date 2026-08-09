/** Indonesian money format used ONLY in PDFs (spec: match the SOP exactly —
 * "Rp 1.348.100,00", period thousands separator, comma + 2 decimals). This
 * is intentionally separate from lib/utils.ts's formatCurrency(), which is
 * tuned for on-screen display (no decimals) and shouldn't change. */
export function formatMoneyForPdf(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const fixed = (Number.isFinite(n) ? n : 0).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp ${withThousands},${decPart}`;
}

/** "Jakarta 29 July 2026" style date, matching the reference quotation PDF. */
export function formatPdfDate(date: Date | string, city = "Jakarta"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const formatted = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
  return `${city} ${formatted}`;
}

/** Resolves a private-storage relative key (e.g. "branding/logo.png") to the
 * image format @react-pdf/renderer needs alongside the raw Buffer. */
export function imageFormatFromKey(key: string | null | undefined): "png" | "jpg" | null {
  if (!key) return null;
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  return null;
}
