import type { CommandQuickLink } from "./project-command";

/**
 * Tautan modul untuk Command Center.
 *
 * Aturan yang dipegang berkas ini: setiap tautan menuju modul yang SUDAH
 * ADA, tidak ada layar baru. Command Center menjawab "sedang di mana", lalu
 * menyerahkan pekerjaannya ke modul yang sudah dikenal orang.
 *
 * Yang membuat angka di tautan berguna bukan jumlahnya, melainkan petunjuk
 * di sebelahnya. "23 dokumen" tidak memberi tahu apa pun; "5 menunggu
 * persetujuan" memberi tahu ke mana harus pergi lebih dulu. Karena itu
 * petunjuk hanya ditulis kalau ada yang perlu ditindak — tautan yang selalu
 * berlabel akan berhenti dibaca.
 */

export interface QuickLinkCounts {
  costing: number;
  quotation: number;
  vendorPo: number;
  /** PO vendor yang belum dikirim — masih bisa dibatalkan. */
  vendorPoPending: number;
  expense: number;
  /** Biaya berstatus DRAFT atau SUBMITTED. */
  expensePending: number;
  invoice: number;
  /** Invoice terbit yang masih ada sisa tagihannya. */
  invoiceOutstanding: number;
  document: number;
}

export function buildQuickLinks(
  projectId: string,
  counts: QuickLinkCounts,
): CommandQuickLink[] {
  const hint = (when: boolean, text: string) => (when ? text : undefined);

  return [
    {
      label: "Costing",
      href: "/sales/costing",
      count: counts.costing,
      hint: hint(counts.costing === 0, "belum ada"),
    },
    {
      label: "Penawaran",
      href: "/sales/quotations",
      count: counts.quotation,
      hint: hint(counts.quotation === 0, "belum ada"),
    },
    {
      label: "PO vendor",
      href: "/procurement/vendor-po",
      count: counts.vendorPo,
      hint: hint(
        counts.vendorPoPending > 0,
        `${counts.vendorPoPending} belum dikirim`,
      ),
    },
    {
      label: "Papan biaya",
      href: `/projects/${projectId}/cost-board`,
      hint: "Baseline vs aktual",
    },
    {
      label: "Biaya proyek",
      href: `/finance/expenses?project=${projectId}`,
      count: counts.expense,
      hint: hint(
        counts.expensePending > 0,
        `${counts.expensePending} menunggu persetujuan`,
      ),
    },
    {
      label: "Invoice",
      href: "/finance/invoices",
      count: counts.invoice,
      hint: hint(
        counts.invoiceOutstanding > 0,
        `${counts.invoiceOutstanding} belum lunas`,
      ),
    },
    {
      label: "Dokumen",
      href: `/projects/${projectId}?tab=documents`,
      count: counts.document,
      hint: hint(counts.document === 0, "kosong"),
    },
  ];
}
