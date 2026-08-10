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

export const NAV: NavGroup[] = [
  { label: "Dashboard", icon: "LayoutDashboard", items: [{ label: "Overview", href: "/dashboard" }] },
  { label: "Numbering", icon: "Hash", items: [{ label: "Ambil Nomor", href: "/numbering" }] },
  {
    // Costing, Quotations, Purchase Orders, and Contracts are intentionally
    // NOT listed here anymore (spec: these are created and reached from
    // inside each Opportunity's own folders — "3. Costing" / "4. Quotation"
    // / "5. PO" / "6. Dokumen Kontrak" — not browsed as flat global lists).
    // The routes themselves still exist (detail pages, PDF view/print, and
    // dashboard deep-links like "quotations awaiting approval" still work),
    // they're just no longer a primary nav entry point.
    label: "Sales",
    icon: "Briefcase",
    items: [
      { label: "Customers", href: "/sales/customers" },
      { label: "Contacts", href: "/sales/contacts" },
      { label: "Opportunities", href: "/sales/opportunities" },
    ],
  },
  {
    label: "Finance",
    icon: "Wallet",
    roles: ["ADMIN", "FINANCE"],
    items: [
      { label: "Invoices", href: "/finance/invoices" },
      { label: "Payments", href: "/finance/payments" },
      { label: "Expenses", href: "/finance/expenses" },
      { label: "Receivables", href: "/finance/receivables" },
      { label: "Finance Reports", href: "/reports/finance" },
    ],
  },
  {
    label: "Project",
    icon: "FolderKanban",
    items: [
      { label: "All Projects", href: "/projects" },
      { label: "Project Tasks", href: "/projects?view=tasks" },
      { label: "Project Closing", href: "/projects?view=closing" },
    ],
  },
  {
    // Outbound vendor/procurement PO (SSO -> Vendor) — distinct from the
    // Sales-side "5. PO" (customer's PO to SSO, still reachable from inside
    // an Opportunity's own folders).
    label: "Procurement",
    icon: "ShoppingCart",
    items: [{ label: "Vendor Purchase Orders", href: "/procurement/vendor-po" }],
  },
  {
    label: "Documents",
    icon: "FileText",
    items: [
      { label: "All Documents", href: "/documents" },
      { label: "Trash", href: "/documents/trash" },
    ],
  },
  {
    label: "Reports",
    icon: "BarChart3",
    items: [
      { label: "Sales Report", href: "/reports/sales" },
      { label: "Finance Report", href: "/reports/finance" },
      { label: "Project Report", href: "/reports/project" },
      { label: "Profitability", href: "/reports/profitability" },
      { label: "Executive Report", href: "/reports/executive" },
    ],
  },
  {
    label: "Settings",
    icon: "Settings",
    roles: ["ADMIN"],
    items: [
      { label: "Users", href: "/settings/users" },
      { label: "Company Settings", href: "/settings/company" },
      { label: "Panduan Sistem", href: "/settings/manual" },
    ],
  },
  { label: "Activity Log", icon: "History", roles: ["ADMIN"], items: [{ label: "Activity Log", href: "/activity-log" }] },
];
