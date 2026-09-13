/** Presentation only. Persisted enum values and document titles are never translated. */
const labels: Record<string, string> = {
  TODO: "Belum dimulai", IN_PROGRESS: "Dikerjakan", BLOCKED: "Terhambat", COMPLETED: "Selesai",
  PENDING: "Menunggu", DELAYED: "Terlambat", LOW: "Rendah", MEDIUM: "Sedang", HIGH: "Tinggi", CRITICAL: "Mendesak",
  DRAFT: "Draf", SUBMITTED: "Diajukan", APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan",
  PAID: "Lunas", UNPAID: "Belum dibayar", PARTIALLY_PAID: "Dibayar sebagian", ISSUED: "Diterbitkan", OVERDUE: "Lewat jatuh tempo",
  SENT: "Dikirim", VERIFIED: "Diverifikasi", PLANNING: "Perencanaan", ACTIVE: "Aktif", ON_HOLD: "Ditunda", AT_RISK: "Perlu perhatian", CLOSED: "Ditutup",
  LABOR: "Tenaga kerja", MATERIALS: "Material", TRANSPORTATION: "Transportasi", ACCOMMODATION: "Akomodasi", VENDOR: "Vendor", EQUIPMENT: "Peralatan", MARKETING: "Pemasaran", OTHER: "Lainnya",
};
export function displayLabel(value: string) { return labels[value] || value; }
