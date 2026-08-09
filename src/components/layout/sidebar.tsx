"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Briefcase, Wallet, FolderKanban, FileText,
  BarChart3, Settings, History, Hash, type LucideIcon,
} from "lucide-react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Briefcase, Wallet, FolderKanban, FileText, BarChart3, Settings, History, Hash,
};

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const visibleGroups = NAV.filter((g) => !g.roles || g.roles.includes(role));

  return (
    <aside className="sidebar-scroll flex h-screen w-64 flex-col overflow-y-auto bg-primary text-primary-foreground">
      <div className="px-5 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">PT Sarana Sinergi Optima</p>
        <p className="text-sm font-semibold">Company Management System</p>
      </div>
      <nav className="flex-1 space-y-4 px-3 pb-6">
        {visibleGroups.map((group) => {
          const Icon = ICONS[group.icon];
          return (
            <div key={group.label}>
              <div className="mb-1 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide opacity-60">
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href.split("?")[0];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "block rounded-md px-3 py-1.5 text-sm transition-colors",
                        active ? "bg-white/15 font-medium" : "text-primary-foreground/80 hover:bg-white/10"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
