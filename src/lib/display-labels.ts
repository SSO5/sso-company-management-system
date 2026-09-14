/** Presentation only. Persisted enum values and document titles are never translated. */
const labels: Record<string, string> = {
  TODO: "Belum dimulai", IN_PROGRESS: "Dikerjakan", BLOCKED: "Terhambat", COMPLETED: "Selesai",
  PENDING: "Menunggu", DELAYED: "Terlambat", LOW: "Rendah", MEDIUM: "Sedang", HIGH: "Tinggi", CRITICAL: "Mendesak",
  DRAFT: "Draf", SUBMITTED: "Diajukan", UNDER_REVIEW: "Sedang diperiksa", APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan", FINAL: "Final", CONVERTED: "Menjadi penawaran", EXPIRED: "Kedaluwarsa",
  PAID: "Lunas", UNPAID: "Belum dibayar", PARTIALLY_PAID: "Dibayar sebagian", ISSUED: "Diterbitkan", OVERDUE: "Lewat jatuh tempo",
  SENT: "Dikirim", VERIFIED: "Diverifikasi", PLANNING: "Perencanaan", ACTIVE: "Aktif", ON_HOLD: "Ditunda", AT_RISK: "Perlu perhatian", CLOSED: "Ditutup",
  LABOR: "Tenaga kerja", MATERIALS: "Material", TRANSPORTATION: "Transportasi", ACCOMMODATION: "Akomodasi", VENDOR: "Vendor", EQUIPMENT: "Peralatan", MARKETING: "Pemasaran", OTHER: "Lainnya",
  PROSPECT: "Calon pelanggan", CUSTOMER: "Pelanggan", PARTNER: "Mitra", INACTIVE: "Tidak aktif",
  NEW: "Baru", QUALIFIED: "Terkualifikasi", PROPOSAL: "Penawaran", NEGOTIATION: "Negosiasi", WON: "Dimenangkan", LOST: "Tidak berlanjut",
};
export function displayLabel(value: string) { return labels[value] || value; }
