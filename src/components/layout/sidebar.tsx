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
import { cn, brandingUrl } from "@/lib/utils";
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
export function Sidebar({
  role, userName, avatarUrl, uiMood = "default", open, onClose,
}: { role: UserRole; userName: string; avatarUrl: string | null; uiMood?: string; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const avatarSrc = brandingUrl(avatarUrl);
  const initials = userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  // Filter at BOTH levels. Group-level filtering alone is not enough now that
  // nav.ts scopes individual items by role — without the item pass, a SALES
  // user would still see all five report links even though four of them are
  // not theirs to read. A group left with no visible items is dropped whole,
  // so an empty accordion can never appear.
  const visibleGroups = NAV.filter((g) => !g.roles || g.roles.includes(role))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

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
          // "mood-sidebar" is the same kind of inert hook as Card's
          // "mood-card" (see components/ui/card.tsx) — Settings > Profil
          // Saya's "suasana" picker overrides its background/text color in
          // globals.css's SUASANA block; on the default mood it does nothing.
          "sidebar-scroll mood-sidebar fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col overflow-y-auto bg-primary text-primary-foreground transition-transform duration-200 ease-in-out",
          "md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        data-ui-mood={uiMood}
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

        <Link
          href="/settings/profile"
          className="mx-3.5 mb-3.5 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] p-3 transition-colors hover:bg-white/10"
        >
          {avatarSrc ? (
            // Wrapper does the circular clip (see profile-hub.tsx for why:
            // border-radius directly on an <img> with object-fit is
            // unreliable on WebKit/Safari).
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarSrc} alt={userName} className="h-full w-full object-cover object-top" />
            </div>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning text-xs font-bold text-primary">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{userName}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/55">{role.replace("_", " ")}</p>
          </div>
        </Link>
        <div className="mx-5 mb-3 h-px bg-white/10" />

        <nav className="flex-1 space-y-1 px-3 pb-6">
          {visibleGroups.map((group) => {
            const Icon = ICONS[group.icon];
            const isExpanded = expanded[group.label] ?? false;

            // A group holding one item is not a group — it's a link. Rendering
            // it as an accordion means one extra click to reach a destination
            // the label already named ("Beranda" > "Tugas & Ringkasan"), which
            // is pure friction for the page people open most.
            if (group.items.length === 1) {
              const only = group.items[0];
              const href = stripQuery(only.href);
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={group.label}
                  href={only.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                    active ? "bg-white/15" : "opacity-80 hover:bg-white/5"
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {group.label}
                </Link>
              );
            }

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
