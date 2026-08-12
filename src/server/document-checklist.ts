"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";

/**
 * "Dokumen apa yang belum saya unggah?" — answered by the system, not by the
 * person.
 *
 * The old flow asked the user to already know two things before they could
 * file anything: which document a job still needs, and which of ~23 folders it
 * belongs in. Both are knowable from data the app already holds, so both
 * should be the app's job.
 *
 * Design notes:
 *
 * 1. NOTHING IS STORED. The checklist is derived on read from job stage,
 *    folder routeKeys, and existing records. A stored checklist would need
 *    maintaining, and a stale checklist is worse than none — it teaches people
 *    to ignore it.
 *
 * 2. A RECORD COUNTS AS SATISFYING ITS SLOT. Costing sheets, quotations and
 *    invoices are created inside the app; they are not uploaded files. Asking
 *    someone to also upload a PDF of a quotation the app itself generated is
 *    exactly the duplicate data entry this system exists to remove. So the
 *    Costing slot is satisfied by a CostingSheet row OR a file, and so on.
 *
 * 3. EXPECTATIONS FOLLOW THE STAGE. A project that has not been invoiced yet
 *    is not "missing" an invoice, and a live project is not missing its BAST.
 *    Flagging documents that are not due yet trains people to dismiss the
 *    list, which costs more than the missing document ever would.
 */

export type ChecklistSeverity = "missing_required" | "missing_optional" | "done";

export interface ChecklistItem {
  routeKey: string;
  label: string;
  hint: string;
  required: boolean;
  count: number;
  /** Where an upload for this slot must land. Null if the folder tree predates this job. */
  folderId: string | null;
  severity: ChecklistSeverity;
}

export interface JobChecklist {
  id: string;
  kind: "OPPORTUNITY" | "PROJECT";
  number: string;
  name: string;
  customer: string;
  stageLabel: string;
  /** Link to the job itself, not to the folder — people navigate by job. */
  href: string;
  items: ChecklistItem[];
  requiredTotal: number;
  requiredDone: number;
  percent: number;
}

interface SlotSpec {
  routeKey: string;
  label: string;
  hint: string;
  required: boolean;
  /** Extra evidence that satisfies this slot without an uploaded file. */
  satisfiedByRecords?: number;
}

function buildItems(specs: SlotSpec[], docCountByRouteKey: Map<string, number>, folderIdByRouteKey: Map<string, string>): ChecklistItem[] {
  return specs.map((s) => {
    const count = (docCountByRouteKey.get(s.routeKey) ?? 0) + (s.satisfiedByRecords ?? 0);
    const severity: ChecklistSeverity = count > 0 ? "done" : s.required ? "missing_required" : "missing_optional";
    return {
      routeKey: s.routeKey,
      label: s.label,
      hint: s.hint,
      required: s.required,
      count,
      folderId: folderIdByRouteKey.get(s.routeKey) ?? null,
      severity,
    };
  });
}

function summarize(items: ChecklistItem[]) {
  const required = items.filter((i) => i.required);
  const requiredDone = required.filter((i) => i.count > 0).length;
  return {
    requiredTotal: required.length,
    requiredDone,
    percent: required.length === 0 ? 100 : Math.round((requiredDone / required.length) * 100),
  };
}

export async function getJobChecklists(): Promise<JobChecklist[]> {
  const actor = await requireUserOrThrow();
  const seesEverything = actor.role === "ADMIN" || actor.role === "VIEWER" || actor.role === "FINANCE";

  const [opportunities, projects] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ["WON", "LOST"] },
        ...(seesEverything || actor.role !== "SALES" ? {} : { salesPicId: actor.userId }),
      },
      select: {
        id: true, number: true, name: true, status: true,
        customer: { select: { companyName: true } },
        folders: { select: { id: true, routeKey: true } },
        _count: { select: { costingSheets: true, quotations: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ["CANCELLED"] },
        ...(seesEverything
          ? {}
          : actor.role === "PROJECT_MANAGER"
            ? { projectManagerId: actor.userId }
            : { salesPicId: actor.userId }),
      },
      select: {
        id: true, number: true, name: true, status: true,
        customer: { select: { companyName: true } },
        folders: { select: { id: true, routeKey: true } },
        invoices: { select: { status: true } },
        _count: { select: { vendorPurchaseOrders: true, progressReports: true, purchaseOrders: true, contracts: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const folderIds = [
    ...opportunities.flatMap((o) => o.folders.map((f) => f.id)),
    ...projects.flatMap((p) => p.folders.map((f) => f.id)),
  ];

  // One grouped query for every folder in scope, rather than a count per slot
  // per job — that would be dozens of round trips against a remote database
  // for a panel that renders on every dashboard load.
  const docCounts = folderIds.length
    ? await prisma.document.groupBy({
        by: ["folderId"],
        where: { folderId: { in: folderIds }, deletedAt: null },
        _count: { _all: true },
      })
    : [];
  const countByFolderId = new Map(docCounts.map((d) => [d.folderId as string, d._count._all]));

  function indexFolders(folders: { id: string; routeKey: string | null }[]) {
    const folderIdByRouteKey = new Map<string, string>();
    const docCountByRouteKey = new Map<string, number>();
    for (const f of folders) {
      if (!f.routeKey) continue;
      folderIdByRouteKey.set(f.routeKey, f.id);
      docCountByRouteKey.set(f.routeKey, (docCountByRouteKey.get(f.routeKey) ?? 0) + (countByFolderId.get(f.id) ?? 0));
    }
    return { folderIdByRouteKey, docCountByRouteKey };
  }

  const OPP_STAGE: Record<string, string> = {
    NEW: "Prospek baru", QUALIFIED: "Sudah dikualifikasi",
    PROPOSAL: "Tahap penawaran", NEGOTIATION: "Tahap negosiasi",
  };
  const PROJECT_STAGE: Record<string, string> = {
    PLANNING: "Persiapan", ACTIVE: "Berjalan", ON_HOLD: "Ditahan",
    AT_RISK: "Berisiko", COMPLETED: "Selesai", CLOSED: "Ditutup",
  };

  const result: JobChecklist[] = [];

  for (const o of opportunities) {
    const { folderIdByRouteKey, docCountByRouteKey } = indexFolders(o.folders);
    const items = buildItems(
      [
        {
          routeKey: "SALES/DATA_INPUT", required: true,
          label: "Data & permintaan pelanggan",
          hint: "BOQ, spesifikasi teknis, gambar, atau email permintaan dari pelanggan.",
        },
        {
          routeKey: "SALES/COSTING", required: true,
          label: "Perhitungan biaya (costing)",
          hint: "Dibuat di dalam aplikasi, atau unggah file costing yang sudah ada.",
          satisfiedByRecords: o._count.costingSheets,
        },
        {
          routeKey: "SALES/QUOTATION", required: true,
          label: "Penawaran ke pelanggan",
          hint: "Dibuat di dalam aplikasi, atau unggah penawaran yang sudah terkirim.",
          satisfiedByRecords: o._count.quotations,
        },
        {
          routeKey: "SALES/ENGINEERING", required: false,
          label: "Konsep engineering",
          hint: "Gambar kerja, perhitungan teknis, atau usulan solusi. Opsional.",
        },
      ],
      docCountByRouteKey, folderIdByRouteKey
    );
    result.push({
      id: o.id, kind: "OPPORTUNITY", number: o.number, name: o.name,
      customer: o.customer.companyName,
      stageLabel: OPP_STAGE[o.status] ?? o.status,
      href: `/sales/opportunities/${o.id}`,
      items, ...summarize(items),
    });
  }

  for (const p of projects) {
    const { folderIdByRouteKey, docCountByRouteKey } = indexFolders(p.folders);
    const isRunning = p.status === "ACTIVE" || p.status === "AT_RISK";
    const isFinishing = p.status === "COMPLETED" || p.status === "CLOSED";
    const hasPaidInvoice = p.invoices.some((i) => i.status === "PAID" || i.status === "PARTIALLY_PAID");
    const hasIssuedInvoice = p.invoices.some((i) => i.status !== "DRAFT" && i.status !== "CANCELLED");

    const items = buildItems(
      [
        {
          routeKey: "SALES/PO", required: true,
          label: "PO dari pelanggan",
          hint: "PO resmi yang menjadi dasar pekerjaan ini.",
          satisfiedByRecords: p._count.purchaseOrders,
        },
        {
          routeKey: "SALES/CONTRACT", required: false,
          label: "Kontrak / SPK",
          hint: "Hanya jika pekerjaan ini memakai kontrak terpisah dari PO.",
          satisfiedByRecords: p._count.contracts,
        },
        {
          // Only expected once there is actually something being procured.
          routeKey: "PROCUREMENT", required: p._count.vendorPurchaseOrders > 0,
          label: "Dokumen pengadaan",
          hint: "PO ke vendor, penawaran vendor, dan konfirmasinya.",
          satisfiedByRecords: p._count.vendorPurchaseOrders,
        },
        {
          routeKey: "PROJECT/PROGRESS_REPORT", required: isRunning,
          label: "Laporan progres",
          hint: "Foto dan catatan lapangan. Wajib selama pekerjaan berjalan.",
          satisfiedByRecords: p._count.progressReports,
        },
        {
          routeKey: "FINANCE/INVOICE", required: isRunning || isFinishing,
          label: "Invoice",
          hint: "Dibuat di dalam aplikasi. Tercatat otomatis begitu invoice terbit.",
          satisfiedByRecords: hasIssuedInvoice ? 1 : 0,
        },
        {
          // Only asked for once money has actually moved.
          routeKey: "FINANCE/PAYMENT", required: hasPaidInvoice,
          label: "Bukti pembayaran",
          hint: "Bukti transfer dari pelanggan untuk invoice yang sudah dibayar.",
        },
        {
          routeKey: "CLOSING/BAST", required: isFinishing,
          label: "BAST (serah terima)",
          hint: "Berita acara serah terima yang sudah ditandatangani pelanggan.",
        },
        {
          routeKey: "CLOSING/FINAL_REPORT", required: isFinishing,
          label: "Laporan akhir",
          hint: "Ringkasan hasil pekerjaan untuk penutupan proyek.",
        },
      ],
      docCountByRouteKey, folderIdByRouteKey
    );

    result.push({
      id: p.id, kind: "PROJECT", number: p.number, name: p.name,
      customer: p.customer.companyName,
      stageLabel: PROJECT_STAGE[p.status] ?? p.status,
      href: `/projects/${p.id}`,
      items, ...summarize(items),
    });
  }

  // Least complete first: the job that most needs attention leads the list.
  result.sort((a, b) => a.percent - b.percent);
  return result;
}

/** Checklist for one job, for the panel embedded in its own detail page. */
export async function getJobChecklistFor(kind: "OPPORTUNITY" | "PROJECT", id: string): Promise<JobChecklist | null> {
  const all = await getJobChecklists();
  return all.find((j) => j.kind === kind && j.id === id) ?? null;
}
