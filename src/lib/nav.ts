import type { UserRole } from "@prisma/client";

export interface NavItem {
  label: string;
  href: string;
  roles?: UserRole[]; // omit = visible to all authenticated roles
}
export interface NavGroup {
  label: string;
  icon: string; // lucide icon name, resolved in Sidebar
  items: NavItem[];
  roles?: UserRole[];
}

/**
 * Navigation is deliberately NOT a map of the data model.
 *
 * The first version listed one group per entity family (Sales, Finance,
 * Project, Procurement, Documents, Reports, Numbering, Activity Log — 8 groups,
 * 22 items). That layout is only legible to someone who already knows that
 * Quotation, Invoice, and Project are separate tables. For a six-person
 * company running three active jobs, it meant every new user had to learn the
 * schema before they could do their job, which is exactly backwards.
 *
 * Two rules now govern this file:
 *
 * 1. GROUP BY THE WORK, NOT BY THE TABLE. "Pekerjaan" holds everything that
 *    moves a job forward — prospect, quotation, project, vendor PO — because
 *    that is one continuous piece of work to the person doing it, even though
 *    it spans four models underneath.
 *
 * 2. EVERY ITEM IS ROLE-SCOPED. A nav entry a given role can never act on is
 *    noise for that person, so it is not shown to them. Yohana sees the sales
 *    report; Faldy sees all five. Same app, different surface area.
 *
 * Nothing is deleted. Routes removed from this list (numbering, the flat
 * quotation/costing/PO/contract lists, activity log) still exist, still work,
 * and are still reached from detail pages, dashboard deep-links, and search.
 * Hiding an entry point is reversible; deleting a feature is not.
 *
 * Net effect: ADMIN sees 6 groups, everyone else sees 4-5.
 */
export const NAV: NavGroup[] = [
  {
    label: "Beranda",
    icon: "LayoutDashboard",
    items: [
      { label: "Tugas & Ringkasan", href: "/dashboard" },
      // Direktur -> employee task/reminder, in-system instead of personal WA.
      // Every role sees "Tugas dari Direktur" (their own assigned tasks);
      // ADMIN gets the "beri tugas" form inside the same page (see /tasks).
      { label: "Tugas dari Direktur", href: "/tasks" },
      // Self-service — every role can set their own photo/jabatan/WA,
      // unlike Settings > Pengguna which stays Admin-only. Lives here (not
      // Pengaturan) since that whole group is hidden from non-Admin/IT roles.
      { label: "Profil Saya", href: "/settings/profile" },
    ],
  },
  {
    // One group for the whole job lifecycle. Costing, Quotation, customer PO
    // and Contract are NOT listed as separate entries on purpose — they are
    // created and reached from inside each Opportunity's own folders
    // ("3. Costing" / "4. Quotation" / "5. PO" / "6. Dokumen Kontrak"), which
    // is where the person already is when they need them.
    label: "Pekerjaan",
    icon: "Briefcase",
    items: [
      { label: "Prospek & Penawaran", href: "/sales/opportunities" },
      { label: "Proyek Berjalan", href: "/projects" },
      // Outbound PO (SSO -> Vendor). Distinct from the customer's PO to SSO,
      // which lives inside the job's own "5. PO" folder.
      { label: "Pesanan ke Vendor", href: "/procurement/vendor-po", roles: ["ADMIN", "PROJECT_MANAGER", "VIEWER", "IT"] },
      { label: "Pelanggan & Kontak", href: "/sales/customers", roles: ["ADMIN", "SALES", "VIEWER", "IT"] },
      // Moved here from the old standalone "Dokumen" group (Aug 2026) — the
      // only thing that lived there worth keeping was the per-project folder
      // tree, and browsing project documents is squarely "Pekerjaan" work.
      // The old "Company Documents" grid (Administrasi/HR/Legal/etc., never
      // populated) was removed outright, not just hidden — see
      // lib/workflows/folders.ts's COMPANY_FOLDER_TEMPLATE, no longer called.
      { label: "Dokumen Proyek", href: "/projects/folders" },
    ],
  },
  {
    label: "Keuangan",
    icon: "Wallet",
    roles: ["ADMIN", "FINANCE", "VIEWER", "IT"],
    items: [
      { label: "Invoice", href: "/finance/invoices" },
      { label: "Pembayaran", href: "/finance/payments" },
      { label: "Piutang", href: "/finance/receivables" },
      { label: "Pengeluaran", href: "/finance/expenses" },
      // General Ledger Phase 1 (Aug 2026) — Beban Operasional is company-wide
      // cost (gaji, sewa kantor, dll) that isn't tied to a Project, so it's
      // its own item rather than folded into "Pengeluaran" (ProjectExpense).
      { label: "Beban Operasional", href: "/finance/company-expenses" },
      // Bagan Akun ownership is Admin + the internal accountant (FINANCE
      // role) specifically, per the founder's own answer — not the whole
      // Keuangan group, which is why this one item carries its own roles
      // override instead of inheriting the group's.
      { label: "Bagan Akun", href: "/settings/chart-of-accounts", roles: ["ADMIN", "FINANCE"] },
    ],
  },
  {
    // Role-scoped so a non-admin sees exactly the one report they own,
    // instead of a five-item list of which four are not theirs to read.
    label: "Laporan",
    icon: "BarChart3",
    items: [
      { label: "Ringkasan Eksekutif", href: "/reports/executive", roles: ["ADMIN", "VIEWER"] },
      { label: "Profitabilitas", href: "/reports/profitability", roles: ["ADMIN", "VIEWER"] },
      { label: "Penjualan", href: "/reports/sales", roles: ["ADMIN", "SALES", "VIEWER"] },
      { label: "Keuangan", href: "/reports/finance", roles: ["ADMIN", "FINANCE", "VIEWER"] },
      { label: "Proyek", href: "/reports/project", roles: ["ADMIN", "PROJECT_MANAGER", "VIEWER"] },
    ],
  },
  {
    // Numbering and the Activity Log moved in here from the top level. Both
    // are system-administration surfaces, not daily work: document numbers are
    // issued automatically the moment a record is created, so "Ambil Nomor"
    // being a primary menu item was asking people to do by hand what the
    // system already does for them (see lib/numbering.ts). The page stays for
    // the case it was actually built for — reserving a number for a document
    // produced outside the app.
    //
    // IT sees this group too (storage health, numbering, activity log, and
    // Koreksi Dokumen are squarely their territory) but NOT "Pengguna" —
    // account creation/role changes stay an organizational decision for
    // ADMIN, so that one item keeps its own roles override below.
    label: "Pengaturan",
    icon: "Settings",
    roles: ["ADMIN", "IT"],
    items: [
      { label: "Pengguna", href: "/settings/users", roles: ["ADMIN"] },
      { label: "Data Perusahaan", href: "/settings/company", roles: ["ADMIN"] },
      { label: "Tema", href: "/settings/theme", roles: ["ADMIN"] },
      { label: "Penyimpanan File", href: "/settings/storage" },
      { label: "Nomor Dokumen", href: "/numbering" },
      // The IT correction tool — see lib/workflows/corrections.ts.
      { label: "Koreksi Dokumen", href: "/settings/document-correction" },
      // Moved from the old standalone "Dokumen" group (Aug 2026) when that
      // group was removed — restoring/permanently-clearing a document stays
      // exactly the same ADMIN/IT-only recovery action it always was, just
      // filed alongside Koreksi Dokumen instead of orphaned with no entry
      // point in the nav.
      { label: "Sampah Dokumen", href: "/documents/trash", roles: ["ADMIN", "IT"] },
      { label: "Panduan Sistem", href: "/settings/manual" },
      { label: "Log Aktivitas", href: "/activity-log" },
    ],
  },
];
