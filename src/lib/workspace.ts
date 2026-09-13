/** Shared, deterministic presentation rules; never rewrite source records. */
export const ISSUED_INVOICE_STATUSES = [
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
] as const;
export function isIssuedInvoice(status: string) {
  return (ISSUED_INVOICE_STATUSES as readonly string[]).includes(status);
}
export function safeNextPath(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\r\n]/.test(value) &&
    !value.startsWith("/login")
    ? value
    : "/dashboard";
}
export function latestReportsPerProject<
  T extends { project: { id: string }; inspectionDate: Date; createdAt: Date },
>(reports: T[]): T[] {
  const sorted = [...reports].sort(
    (a, b) =>
      +new Date(b.inspectionDate) - +new Date(a.inspectionDate) ||
      +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  const seen = new Set<string>();
  return sorted.filter((r) => {
    if (seen.has(r.project.id)) return false;
    seen.add(r.project.id);
    return true;
  });
}
export function duplicateDocumentKey(doc: {
  originalName: string;
  fileSize: number;
  folderId: string | null;
}) {
  return `${doc.folderId ?? "unfiled"}|${doc.originalName.trim().toLowerCase()}|${doc.fileSize}`;
}
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Ruang Kendali",
  SALES: "Ruang Penjualan",
  FINANCE: "Ruang Keuangan",
  PROJECT_MANAGER: "Ruang Proyek",
  VIEWER: "Ruang Direksi",
  IT: "Ruang Data & Sistem",
};
