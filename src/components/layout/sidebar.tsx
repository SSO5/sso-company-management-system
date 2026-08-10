"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Briefcase, Wallet, FolderKanban, FileText,
  BarChart3, Settings, History, Hash, ChevronDown, X, ShoppingCart, type LucideIcon,
} from "lucide-react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Briefcase, Wallet, FolderKanban, FileText, BarChart3, Settings, History, Hash, ShoppingCart,
};

function stripQuery(href: string): string {
  return href.split("?")[0];
}

/**
 * Mobile-first nav: off-canvas drawer that slides in from the left
 * (translate-x, backdrop, auto-closes on route change) below the `md`
 * breakpoint, and reverts to a normal static sidebar at `md` and up. Each
 * group ("Sales", "Finance", "Project", ...) is its own collapsible
 * accordion — starts expanded only if the current route is inside it — so
 * the list doesn't run far past the fold on a phone screen.
 */
export function Sidebar({ role, open, onClose }: { role: UserRole; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const visibleGroups = NAV.filter((g) => !g.roles || g.roles.includes(role));

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of visibleGroups) {
      initial[group.label] = group.items.some((item) => {
        const href = stripQuery(item.href);
        return pathname === href || pathname.startsWith(`${href}/`);
      });
    }
    return initial;
  });

  // Selecting a link should collapse the drawer on mobile automatically.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleGroup(label: string) {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "sidebar-scroll fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col overflow-y-auto bg-primary text-primary-foreground transition-transform duration-200 ease-in-out",
          "md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <Image
            src="/logo-wordmark.png"
            alt="SSO Connect — PT Sarana Sinergi Optima"
            width={220}
            height={64}
            priority
            className="h-9 w-auto"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 hover:bg-white/10 md:hidden"
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3 pb-6">
          {visibleGroups.map((group) => {
            const Icon = ICONS[group.icon];
            const isExpanded = expanded[group.label] ?? false;
            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-80 hover:bg-white/5"
                  aria-expanded={isExpanded}
                >
                  <span className="flex items-center gap-2">
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {group.label}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-150", isExpanded && "rotate-180")} />
                </button>
                {isExpanded && (
                  <div className="mt-0.5 space-y-0.5 pb-2">
                    {group.items.map((item) => {
                      const href = stripQuery(item.href);
                      const active = pathname === href;
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
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
