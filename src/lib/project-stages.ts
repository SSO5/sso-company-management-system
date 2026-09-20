import type { CommandStage, CommandStageKey } from "./project-command";

/**
 * Penanda tahapan alur proyek.
 *
 * Empat tahap, urutannya sama dengan jalannya pekerjaan yang sebenarnya di
 * SSO: Komersial (dari mana pekerjaan datang) -> Pengadaan (apa yang sudah
 * dipesan) -> Pelaksanaan (sampai mana di lapangan) -> Kendali (apakah
 * uangnya masih sesuai rencana).
 *
 * Yang membuat berkas ini pantas berdiri sendiri bukan panjangnya, melainkan
 * satu keputusan yang diulang di setiap tahap: KAPAN sebuah langkah disebut
 * TERTAHAN. Itu bukan soal tampilan. "Belum ada PO pelanggan" bukan detail
 * administratif — itu yang menahan uang masuk, dan harus terbaca merah.
 * Menyebar keputusan itu ke dalam JSX membuatnya mustahil diuji dan mudah
 * berubah diam-diam.
 *
 * Tidak ada angka yang dihitung di sini. Semua masukan sudah jadi.
 */

export interface StageInput {
  projectId: string;
  budget: number;
  contractValue: number;
  cost: { actualCost: number; committedCost: number; pendingCost: number };
  milestones: { name: string; dueDate: Date | null; completedAt: Date | null }[];
  opportunity: { number: string; status: string } | null;
  costing: { number: string; status: string } | null;
  quotation: { number: string; status: string } | null;
  customerPurchaseOrders: { number: string; poValue: number }[];
  vendorPurchaseOrders: { number: string; status: string; grandTotal: number }[];
  billing: { totalInvoiced: number; totalPaid: number };
  weeklyReportCount: number;
  now: Date;
}

/** Status penawaran yang berarti pekerjaannya sudah pasti dimiliki. */
const DONE_QUOTATION = new Set(["WON", "SENT", "APPROVED"]);
/** PO vendor yang sudah keluar dari kantor — uangnya tidak bisa ditarik lagi. */
const SENT_VENDOR_PO = new Set(["SENT", "CONFIRMED"]);

function money(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function buildProjectStages(input: StageInput): CommandStage[] {
  const { cost, milestones, now } = input;
  const id = input.projectId;
  const project = { budget: input.budget, contractValue: input.contractValue };

  const milestonesDone = milestones.filter((m) => m.completedAt !== null).length;
  const overdue = milestones.filter(
    (m) => m.completedAt === null && m.dueDate !== null && m.dueDate < now,
  );
  const billed = input.billing.totalInvoiced;
  const paid = input.billing.totalPaid;
  const sentVendorPos = input.vendorPurchaseOrders.filter((v) =>
    SENT_VENDOR_PO.has(v.status),
  );
  const draftVendorPos = input.vendorPurchaseOrders.filter(
    (v) => !SENT_VENDOR_PO.has(v.status) && v.status !== "CANCELLED",
  );
  const poValue = input.customerPurchaseOrders.reduce((t, p) => t + p.poValue, 0);

  return [
    {
      key: "COMMERCIAL",
      title: "Komersial",
      caption: "Dari mana pekerjaan ini datang dan berapa nilainya.",
      steps: [
        {
          label: "Peluang",
          state: input.opportunity ? "DONE" : "TODO",
          detail: input.opportunity
            ? `${input.opportunity.number} · ${input.opportunity.status}`
            : "Proyek ini tidak berasal dari peluang tercatat",
          href: input.opportunity ? "/sales/opportunities" : undefined,
        },
        {
          label: "Costing final",
          state: input.costing
            ? input.costing.status === "DRAFT"
              ? "ACTIVE"
              : "DONE"
            : "TODO",
          detail: input.costing
            ? `${input.costing.number} · pagu ${money(project.budget)}`
            : "Belum ada costing yang tertaut",
          href: "/sales/costing",
        },
        {
          label: "Penawaran",
          state: input.quotation
            ? DONE_QUOTATION.has(input.quotation.status)
              ? "DONE"
              : "ACTIVE"
            : "TODO",
          detail: input.quotation
            ? `${input.quotation.number} · ${input.quotation.status}`
            : "Belum ada penawaran yang tertaut",
          href: "/sales/quotations",
        },
        {
          label: "PO pelanggan",
          state: input.customerPurchaseOrders.length > 0 ? "DONE" : "BLOCKED",
          detail:
            input.customerPurchaseOrders.length > 0
              ? `${input.customerPurchaseOrders.length} PO · ${money(poValue)}`
              : "Belum ada PO pelanggan — dasar penagihan belum lengkap",
          href: "/sales/purchase-orders",
        },
      ],
    },
    {
      key: "PROCUREMENT",
      title: "Pengadaan",
      caption: "Apa yang sudah dipesan ke vendor dan berapa yang terikat.",
      steps: [
        {
          label: "PO vendor terkirim",
          state: sentVendorPos.length > 0 ? "DONE" : "TODO",
          detail:
            sentVendorPos.length > 0
              ? `${sentVendorPos.length} PO · ${money(
                  sentVendorPos.reduce((t, v) => t + v.grandTotal, 0),
                )}`
              : "Belum ada PO vendor yang dikirim",
          href: "/procurement/vendor-po",
        },
        {
          label: "PO vendor belum dikirim",
          state: draftVendorPos.length > 0 ? "ACTIVE" : "DONE",
          detail:
            draftVendorPos.length > 0
              ? `${draftVendorPos.length} PO masih draf atau menunggu persetujuan`
              : "Tidak ada yang tertahan",
          href: "/procurement/vendor-po",
        },
        {
          label: "Nilai terikat",
          state: cost.committedCost > 0 ? "ACTIVE" : "DONE",
          detail:
            cost.committedCost > 0
              ? `${money(cost.committedCost)} sudah terikat, belum jadi biaya`
              : "Tidak ada komitmen yang menggantung",
          href: `/projects/${id}/cost-board`,
        },
      ],
    },
    {
      key: "EXECUTION",
      title: "Pelaksanaan",
      caption: "Sudah sampai mana pekerjaannya di lapangan.",
      steps: [
        {
          label: "Milestone selesai",
          state:
            milestones.length === 0
              ? "TODO"
              : milestonesDone === milestones.length
                ? "DONE"
                : "ACTIVE",
          detail:
            milestones.length === 0
              ? "Milestone belum disusun"
              : `${milestonesDone} dari ${milestones.length}`,
          href: `/projects/${id}?tab=progress`,
        },
        {
          label: "Milestone lewat tanggal",
          state: overdue.length > 0 ? "BLOCKED" : "DONE",
          detail:
            overdue.length > 0
              ? overdue.map((m) => m.name).join(", ")
              : "Tidak ada yang lewat tanggal rencana",
          href: `/projects/${id}?tab=progress`,
        },
        {
          label: "Laporan mingguan",
          state: input.weeklyReportCount > 0 ? "DONE" : "TODO",
          detail:
            input.weeklyReportCount > 0
              ? `${input.weeklyReportCount} laporan tercatat`
              : "Belum ada laporan progres",
          href: `/projects/${id}?tab=progress`,
        },
      ],
    },
    {
      key: "CONTROL",
      title: "Kendali",
      caption: "Apakah uangnya masih sesuai rencana.",
      steps: [
        {
          label: "Biaya disetujui",
          state: cost.actualCost > 0 ? "ACTIVE" : "TODO",
          detail:
            project.budget > 0
              ? `${money(cost.actualCost)} dari pagu ${money(project.budget)}`
              : `${money(cost.actualCost)} · pagu belum ditetapkan`,
          href: `/projects/${id}/cost-board`,
        },
        {
          label: "Menunggu persetujuan",
          state: cost.pendingCost > 0 ? "BLOCKED" : "DONE",
          detail:
            cost.pendingCost > 0
              ? `${money(cost.pendingCost)} belum diputuskan`
              : "Tidak ada biaya yang menggantung",
          href: `/finance/expenses?project=${id}`,
        },
        {
          label: "Invoice terbit",
          state: billed > 0 ? "ACTIVE" : "TODO",
          detail:
            billed > 0
              ? `${money(billed)} dari nilai kontrak ${money(project.contractValue)}`
              : "Belum ada invoice terbit",
          href: "/finance/invoices",
        },
        {
          label: "Kas diterima",
          state: paid > 0 ? "ACTIVE" : "TODO",
          detail:
            billed > 0
              ? `${money(paid)} · piutang ${money(billed - paid)}`
              : "Belum ada penerimaan",
          href: "/finance/invoices",
        },
      ],
    },
  ];
}

/** Urutan tahap yang dijamin, dipakai untuk memeriksa kelengkapan. */
export const STAGE_ORDER: CommandStageKey[] = [
  "COMMERCIAL",
  "PROCUREMENT",
  "EXECUTION",
  "CONTROL",
];
