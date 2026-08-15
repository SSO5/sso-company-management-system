import type { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

/**
 * Folder structure is data, not frontend decoration (spec section 24: "The
 * folder structure must be stored in the database. Do not hardcode it only
 * in frontend."). These templates are the single source of truth used to
 * materialize real Folder rows. routeKey is what auto-routing (section 26)
 * matches against so uploads land in the right place without the user
 * picking a destination.
 */

interface FolderTemplateNode {
  name: string;
  routeKey?: string;
  children?: FolderTemplateNode[];
}

// "01 Sales" mirrors OPPORTUNITY_FOLDER_TEMPLATE below folder-for-folder (same
// names, same routeKeys) on purpose: when a Quotation is marked WON,
// mergeOpportunityFoldersIntoProject() moves every document out of the
// Opportunity's folders into these matching ones by routeKey, then deletes
// the (now-empty) Opportunity folder tree. Same slots, no doubled folders.
// Names/order match SSO's own real per-prospect folder convention (see
// "FORMAT FOLDER" template in PROSPEK 2026: 1.Data Input, 2.Engineering
// Concept, 3.Costing, 4.Quotation, 5.PO — "6. Dokumen Kontrak" added since
// at least one real job (JPC Balikpapan) already keeps one).
export const PROJECT_FOLDER_TEMPLATE: FolderTemplateNode[] = [
  {
    name: "01 Sales",
    routeKey: "SALES_SECTION",
    children: [
      { name: "1. Data Input", routeKey: "SALES/DATA_INPUT" },
      { name: "2. Engineering Concept", routeKey: "SALES/ENGINEERING" },
      { name: "3. Costing", routeKey: "SALES/COSTING" },
      { name: "4. Quotation", routeKey: "SALES/QUOTATION" },
      { name: "5. PO", routeKey: "SALES/PO" },
      { name: "6. Dokumen Kontrak", routeKey: "SALES/CONTRACT" },
    ],
  },
  {
    name: "02 Finance",
    children: [
      { name: "Invoice", routeKey: "FINANCE/INVOICE" },
      { name: "Payment", routeKey: "FINANCE/PAYMENT" },
      { name: "Financial Documents", routeKey: "FINANCE/FINANCIAL_DOCUMENTS" },
    ],
  },
  {
    name: "03 Project",
    children: [
      { name: "Project Plan", routeKey: "PROJECT/PROJECT_PLAN" },
      { name: "Timeline", routeKey: "PROJECT/TIMELINE" },
      { name: "Progress Report", routeKey: "PROJECT/PROGRESS_REPORT" },
      { name: "Meeting", routeKey: "PROJECT/MEETING" },
      { name: "Deliverables", routeKey: "PROJECT/DELIVERABLES" },
    ],
  },
  { name: "04 Procurement", routeKey: "PROCUREMENT" },
  { name: "05 Documentation", routeKey: "DOCUMENTATION" },
  {
    name: "06 Closing",
    children: [
      { name: "BAST", routeKey: "CLOSING/BAST" },
      { name: "Final Report", routeKey: "CLOSING/FINAL_REPORT" },
      { name: "Project Closure", routeKey: "CLOSING/PROJECT_CLOSURE" },
    ],
  },
];

/**
 * Pre-Won folder (spec: documents from the Sales stage — data input,
 * engineering concept, costing, quotation, PO, contract — need a home from
 * the moment an Opportunity is logged, since createProjectFolders() only
 * fires on Won). Created automatically inside createOpportunity() (see
 * server/sales/opportunities.ts). Costing sheets and Quotations for this
 * prospect are created FROM WITHIN folders 3 and 4 respectively (scoped to
 * this opportunity), not from the old global "New Costing"/"New Quotation"
 * list pages. Names/order/routeKeys match SSO's own real per-prospect folder
 * convention (see the "FORMAT FOLDER" template kept in PROSPEK 2026), and
 * are identical to PROJECT_FOLDER_TEMPLATE's "01 Sales" children so the
 * Won-trigger merge can match folders 1:1.
 */
export const OPPORTUNITY_FOLDER_TEMPLATE: FolderTemplateNode[] = [
  { name: "1. Data Input", routeKey: "SALES/DATA_INPUT" },
  { name: "2. Engineering Concept", routeKey: "SALES/ENGINEERING" },
  { name: "3. Costing", routeKey: "SALES/COSTING" },
  { name: "4. Quotation", routeKey: "SALES/QUOTATION" },
  { name: "5. PO", routeKey: "SALES/PO" },
  { name: "6. Dokumen Kontrak", routeKey: "SALES/CONTRACT" },
];

export const COMPANY_FOLDER_TEMPLATE: FolderTemplateNode[] = [
  {
    name: "Administrasi",
    children: [
      { name: "Surat Masuk" }, { name: "Surat Keluar" }, { name: "Dokumen Internal" },
      { name: "Notulen & Berita Acara" }, { name: "SOP & Prosedur" },
    ],
  },
  {
    name: "Keuangan",
    children: [
      { name: "Anggaran & RAB" }, { name: "Invoice" }, { name: "Bukti Pembayaran" },
      { name: "Laporan Keuangan" }, { name: "Pajak" }, { name: "Rekening & Bank" },
    ],
  },
  {
    name: "HR",
    children: [
      { name: "Data Karyawan" }, { name: "Kontrak & Perjanjian" }, { name: "Absensi & Cuti" },
      { name: "Payroll" }, { name: "Rekrutmen" }, { name: "Penilaian Kinerja" },
    ],
  },
  {
    name: "Legal",
    children: [
      { name: "Akta & Legalitas" }, { name: "Perjanjian" }, { name: "Kontrak" },
      { name: "Perizinan" }, { name: "Dokumen Hukum" },
    ],
  },
  {
    name: "Marketing",
    children: [
      { name: "Branding" }, { name: "Proposal" }, { name: "Materi Promosi" },
      { name: "Social Media" }, { name: "Campaign" }, { name: "Dokumentasi" },
    ],
  },
  { name: "Project" },
  {
    name: "Dokumen Perusahaan",
    children: [
      { name: "Profil Perusahaan" }, { name: "Company Profile" }, { name: "Struktur Organisasi" },
      { name: "Visi & Misi" }, { name: "Dokumen Strategis" },
    ],
  },
  {
    name: "Arsip",
    children: [
      { name: "Arsip 2026" }, { name: "Arsip 2025" }, { name: "Arsip 2024" }, { name: "Arsip Lainnya" },
    ],
  },
];

/**
 * Materializes a folder template as real rows using ONE `createMany` round
 * trip per tree depth (2 for PROJECT/COMPANY templates, 1 for OPPORTUNITY's
 * flat template) instead of one `create` per node.
 *
 * The naive version awaited `tx.folder.create()` node-by-node — for
 * PROJECT_FOLDER_TEMPLATE that's ~23 sequential round trips, all inside the
 * same Won-deal transaction as ~25 other queries. Against a remote Neon
 * instance each round trip costs real network latency, and enough of them
 * stacked in one interactive transaction can outrun even a generous
 * transaction timeout ("Transaction already closed").
 *
 * Fix: generate each row's id client-side (a Folder's `id` only needs to be
 * a valid unique string — Prisma's default cuid() generator is not required
 * for anything downstream) so a child's `parentId` is known BEFORE its
 * parent is inserted, removing the need to read the parent back from the DB.
 * That lets every node at the same depth be inserted in a single
 * `createMany` call, walking the template breadth-first.
 */
async function createTree(
  tx: Prisma.TransactionClient,
  nodes: FolderTemplateNode[],
  opts: { kind: "COMPANY" | "PROJECT" | "OPPORTUNITY"; projectId?: string; opportunityId?: string; parentId?: string; parentPath: string }
) {
  interface PendingRow {
    id: string;
    parentId?: string;
    name: string;
    routeKey?: string;
    path: string;
    children?: FolderTemplateNode[];
  }

  let level: PendingRow[] = nodes.map((n) => ({
    id: randomUUID(),
    parentId: opts.parentId,
    name: n.name,
    routeKey: n.routeKey,
    path: `${opts.parentPath} / ${n.name}`,
    children: n.children,
  }));

  while (level.length > 0) {
    await tx.folder.createMany({
      data: level.map((row) => ({
        id: row.id,
        name: row.name,
        kind: opts.kind,
        parentId: row.parentId,
        projectId: opts.projectId,
        opportunityId: opts.opportunityId,
        routeKey: row.routeKey,
        isSystem: true,
        path: row.path,
      })),
    });

    const nextLevel: PendingRow[] = [];
    for (const row of level) {
      for (const child of row.children ?? []) {
        nextLevel.push({
          id: randomUUID(),
          parentId: row.id,
          name: child.name,
          routeKey: child.routeKey,
          path: `${row.path} / ${child.name}`,
          children: child.children,
        });
      }
    }
    level = nextLevel;
  }
}

/** Called automatically inside the Won-deal transaction (section 24/27). */
export async function createProjectFolders(
  tx: Prisma.TransactionClient,
  project: { id: string; number: string },
  customerName: string
) {
  const rootName = `${project.number} - ${customerName}`;
  const root = await tx.folder.create({
    data: {
      name: rootName,
      kind: "PROJECT",
      projectId: project.id,
      isSystem: true,
      path: rootName,
    },
  });
  await createTree(tx, PROJECT_FOLDER_TEMPLATE, {
    kind: "PROJECT",
    projectId: project.id,
    parentId: root.id,
    parentPath: rootName,
  });
  return root;
}

/** Called automatically the moment an Opportunity is created (spec: don't
 * wait for Won — pre-deal documents need a folder from day one). */
export async function createOpportunityFolders(
  tx: Prisma.TransactionClient,
  opportunity: { id: string; number: string },
  customerName: string
) {
  const rootName = `${opportunity.number} - ${customerName}`;
  const root = await tx.folder.create({
    data: {
      name: rootName,
      kind: "OPPORTUNITY",
      opportunityId: opportunity.id,
      isSystem: true,
      path: rootName,
    },
  });
  await createTree(tx, OPPORTUNITY_FOLDER_TEMPLATE, {
    kind: "OPPORTUNITY",
    opportunityId: opportunity.id,
    parentId: root.id,
    parentPath: rootName,
  });
  return root;
}

/**
 * Won-trigger cascade (spec: "seluruh folder di dalam kartu opportunity
 * tersebut akan ada pindah ke project folder ... tidak ada folder yang
 * doble save dan penamaan"). Called once inside the same transaction that
 * creates the Project (see convertQuotationToProject). Rather than
 * reparenting the Opportunity's folder rows (which would require the
 * Project's "01 Sales" to NOT already have its own 6 slots, risking
 * duplicates), every Document is moved into the matching Project folder by
 * routeKey, then the entire Opportunity folder tree — now empty — is
 * deleted (the parent->child relation cascades, so one delete removes the
 * root and all 7 children in one go).
 */
export async function mergeOpportunityFoldersIntoProject(
  tx: Prisma.TransactionClient,
  opportunityId: string,
  projectId: string
) {
  // Fetch each root together with its children in one round trip (`include`)
  // instead of a separate findFirst + findMany pair — same data, half the
  // queries, since this whole cascade runs inside the same big Won-deal
  // transaction as folder-tree creation.
  const oppRoot = await tx.folder.findFirst({
    where: { kind: "OPPORTUNITY", opportunityId, parentId: null },
    include: { children: true },
  });
  if (!oppRoot) return; // nothing to migrate
  const oppChildren = oppRoot.children;

  const salesSection = await tx.folder.findFirst({
    where: { projectId, routeKey: "SALES_SECTION" },
    include: { children: true },
  });

  if (!salesSection) {
    // Fallback for a Project whose folder tree predates this restructure —
    // reparent wholesale under the Project root instead of losing anything.
    const projectRoot = await tx.folder.findFirst({ where: { projectId, parentId: null, kind: "PROJECT" } });
    await tx.folder.update({
      where: { id: oppRoot.id },
      data: { kind: "PROJECT", projectId, opportunityId: null, parentId: projectRoot?.id ?? null },
    });
    await tx.folder.updateMany({
      where: { parentId: oppRoot.id },
      data: { kind: "PROJECT", projectId, opportunityId: null },
    });
    return;
  }

  const projChildren = salesSection.children;
  const projByRoute = new Map(projChildren.filter((f) => f.routeKey).map((f) => [f.routeKey as string, f]));

  for (const oppChild of oppChildren) {
    const target = oppChild.routeKey ? projByRoute.get(oppChild.routeKey) : undefined;
    if (target) {
      await tx.document.updateMany({ where: { folderId: oppChild.id }, data: { folderId: target.id } });
    }
  }

  await tx.folder.delete({ where: { id: oppRoot.id } }); // cascades to its 6 (now-empty) children
}

/** Idempotent — safe to call on every app boot / seed. Skips if company folders already exist. */
export async function ensureCompanyFolders(tx: Prisma.TransactionClient) {
  const existing = await tx.folder.findFirst({ where: { kind: "COMPANY", parentId: null } });
  if (existing) return;
  await createTree(tx, COMPANY_FOLDER_TEMPLATE, { kind: "COMPANY", parentPath: "Company Documents" });
}

/**
 * Auto-routing (section 26): given the entity a document belongs to, find
 * the right leaf folder inside that project's folder tree so the uploader
 * never has to pick a destination manually.
 */
const ENTITY_TO_ROUTE_KEY: Record<string, string> = {
  QUOTATION: "SALES/QUOTATION",
  DATA_INPUT: "SALES/DATA_INPUT",
  ENGINEERING: "SALES/ENGINEERING",
  COSTING: "SALES/COSTING",
  PURCHASE_ORDER: "SALES/PO",
  CONTRACT: "SALES/CONTRACT",
  INVOICE: "FINANCE/INVOICE",
  PAYMENT: "FINANCE/PAYMENT",
  EXPENSE: "FINANCE/FINANCIAL_DOCUMENTS",
  BAST: "CLOSING/BAST",
  FINAL_REPORT: "CLOSING/FINAL_REPORT",
  PROJECT_CLOSURE: "CLOSING/PROJECT_CLOSURE",
  VENDOR_PO: "PROCUREMENT",
};

export async function resolveDestinationFolder(
  tx: Prisma.TransactionClient,
  params: { projectId?: string | null; relatedEntityType?: string | null }
): Promise<string | undefined> {
  if (!params.projectId || !params.relatedEntityType) return undefined;
  const routeKey = ENTITY_TO_ROUTE_KEY[params.relatedEntityType];
  if (!routeKey) return undefined;
  const folder = await tx.folder.findFirst({
    where: { projectId: params.projectId, routeKey },
  });
  return folder?.id;
}

const ROUTE_KEY_TO_ENTITY: Record<string, string> = Object.fromEntries(
  Object.entries(ENTITY_TO_ROUTE_KEY).map(([entity, routeKey]) => [routeKey, entity])
);

/**
 * Reverse of resolveDestinationFolder: when a user uploads directly INTO a
 * known project folder (e.g. drops a file straight into "06 Closing / BAST"
 * from the Documents browser instead of via an entity's own upload button),
 * we still want that document tagged with relatedEntityType so downstream
 * checks like validateProjectClosing() (which looks for a BAST/FINAL_REPORT
 * document) recognize it. Without this, only uploads that go through an
 * entity-specific flow would ever satisfy the closing checklist.
 */
export function entityTypeForRouteKey(routeKey: string | null | undefined): string | undefined {
  if (!routeKey) return undefined;
  return ROUTE_KEY_TO_ENTITY[routeKey];
}

// The AI upload classifier's menu of valid destinations lives in
// lib/document-folder-options.ts, not here — that file has zero Node/Prisma
// dependencies (this one imports "crypto" for createTree), so client
// components can import the option list directly without pulling in a
// server-only module. Re-exported here too since some server-side code may
// reasonably look for it alongside the rest of the folder-routing logic.
export { DOCUMENT_FOLDER_OPTIONS, type DocumentFolderOption } from "@/lib/document-folder-options";
