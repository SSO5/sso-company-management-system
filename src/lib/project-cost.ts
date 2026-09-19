/**
 * Meringkas biaya sebuah proyek menjadi empat angka yang berbeda maknanya.
 *
 * Dipisah dari calculateProjectProfitability() dan dibuat murni (tanpa
 * menyentuh database) karena inilah aturan uang yang paling mudah salah dan
 * paling mahal akibatnya — jadi harus bisa diuji langsung, sama seperti
 * summarizeIssuedInvoices() di lib/invoice-summary.ts.
 *
 * Empat angka, empat pertanyaan berbeda:
 *
 *   actualCost    Sudah jadi biaya      — hanya yang DISETUJUI
 *   payable       Sudah jadi biaya, uangnya belum keluar
 *   pendingCost   Belum jadi biaya, menunggu keputusan
 *   committedCost Belum jadi biaya, tapi sudah tidak bisa dibatalkan
 *
 * Yang DITOLAK tidak masuk angka mana pun. Itu bukan biaya, bukan utang, dan
 * bukan komitmen — ia sudah selesai urusannya.
 */

export interface ExpenseRow {
  total: number | { toString(): string };
  approvalStatus: string;
  paymentStatus: string;
}

export interface VendorPoRow {
  grandTotal: number | { toString(): string };
  expense: { approvalStatus: string } | null;
}

export interface ProjectCostSummary {
  actualCost: number;
  payable: number;
  pendingCost: number;
  committedCost: number;
  forecastCost: number;
}

const num = (v: number | { toString(): string }) => Number(v);

export function summarizeProjectCost(
  expenses: ExpenseRow[],
  vendorPos: VendorPoRow[],
  budget: number,
): ProjectCostSummary {
  const approved = expenses.filter((e) => e.approvalStatus === "APPROVED");

  const actualCost = approved.reduce((sum, e) => sum + num(e.total), 0);

  const payable = approved
    .filter((e) => e.paymentStatus === "UNPAID")
    .reduce((sum, e) => sum + num(e.total), 0);

  const pendingCost = expenses
    .filter((e) => e.approvalStatus === "DRAFT" || e.approvalStatus === "SUBMITTED")
    .reduce((sum, e) => sum + num(e.total), 0);

  // Sebuah PO vendor yang sudah terkirim otomatis membuat ProjectExpense
  // (markVendorPOSent di workflows/vendor-po.ts). Selama pengeluaran itu
  // belum disetujui, uangnya terikat tapi belum jadi biaya — kalau dihitung
  // sebagai Actual, belanja jadi terlihat lebih besar dari kenyataan.
  const committedCost = vendorPos
    .filter((v) => v.expense?.approvalStatus !== "APPROVED")
    .reduce((sum, v) => sum + num(v.grandTotal), 0);

  // Di bawah pagu, perkiraan tetap di pagu: baris anggaran yang belum
  // tersentuh tetap diharapkan terpakai. Di atas pagu, perkiraan mengikuti
  // belanja yang sebenarnya.
  const forecastCost = Math.max(budget, actualCost + committedCost);

  return { actualCost, payable, pendingCost, committedCost, forecastCost };
}
