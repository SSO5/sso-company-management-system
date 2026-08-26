"use client";
import { useEffect, useRef, useState } from "react";
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

// Width of the icon-only rail in "suasana" mode — the flyout panel below is
// positioned off this same number so the two never drift out of sync.
const RAIL_WIDTH = 80;

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
 *
 * When a personal "suasana" (mood) is active, the whole rail collapses to a
 * narrow icon-only strip (see lib/ui-moods.ts) — full text nav is one of the
 * clearest "default" tells, so it's the first thing a mood swaps out. Every
 * group stays fully reachable: a group with more than one item opens a
 * flyout listing its real items instead of an inline accordion, so no route
 * that was reachable in the default look becomes unreachable here.
 */
export function Sidebar({
  role, userName, avatarUrl, uiMood = "default", open, onClose,
}: { role: UserRole; userName: string; avatarUrl: string | null; uiMood?: string; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const avatarSrc = brandingUrl(avatarUrl);
  const initials = userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const compact = uiMood !== "default";
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
  // Which group's flyout is open, in compact mode only.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Selecting a link should collapse the drawer (and any open flyout)
  // automatically.
  useEffect(() => {
    onClose();
    setOpenGroup(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Click-outside-to-close for the flyout. The panel is rendered as a
  // sibling of <aside>, not inside it — the rail keeps `overflow-y-auto`,
  // which (per spec) forces its other axis to compute as `auto` too, so
  // anything positioned outside the rail's own box via `left: 100%` would be
  // clipped if it were a DOM descendant of the scrolling element.
  useEffect(() => {
    if (!openGroup) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (railRef.current?.contains(target)) return;
      if (flyoutRef.current?.contains(target)) return;
      setOpenGroup(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openGroup]);

  function toggleGroup(label: string) {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function isGroupActive(items: { href: string }[]): boolean {
    return items.some((item) => {
      const href = stripQuery(item.href);
      return pathname === href || pathname.startsWith(`${href}/`);
    });
  }

  const openGroupData = compact ? visibleGroups.find((g) => g.label === openGroup) : undefined;

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
        ref={railRef}
        className={cn(
          // "mood-sidebar" is the same kind of inert hook as Card's
          // "mood-card" (see components/ui/card.tsx) — Settings > Profil
          // Saya's "suasana" picker overrides its background/text color in
          // globals.css's SUASANA block; on the default mood it does nothing.
          "sidebar-scroll mood-sidebar fixed inset-y-0 left-0 z-50 flex h-screen flex-col overflow-y-auto bg-primary text-primary-foreground transition-transform duration-200 ease-in-out",
          compact ? "w-20 items-center" : "w-64",
          "md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        data-ui-mood={uiMood}
      >
        {compact ? (
          <>
            <div className="flex flex-col items-center gap-1 px-2 pb-3 pt-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-[11px] font-bold tracking-wide">
                SSO
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-1 shrink-0 rounded-md p-1 hover:bg-white/10 md:hidden"
                aria-label="Tutup menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mx-3 mb-3 h-px w-8 bg-white/10" />

            <nav className="flex flex-1 flex-col items-center gap-1.5 px-2 pb-4">
              {visibleGroups.map((group) => {
                const Icon = ICONS[group.icon];
                const active = isGroupActive(group.items);
                if (group.items.length === 1) {
                  const only = group.items[0];
                  return (
                    <Link
                      key={group.label}
                      href={only.href}
                      title={group.label}
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                        active ? "bg-white/20" : "opacity-80 hover:bg-white/10"
                      )}
                    >
                      {Icon && <Icon className="h-5 w-5" />}
                    </Link>
                  );
                }
                return (
                  <button
                    key={group.label}
                    type="button"
                    title={group.label}
                    onClick={() => setOpenGroup((prev) => (prev === group.label ? null : group.label))}
                    aria-expanded={openGroup === group.label}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                      active || openGroup === group.label ? "bg-white/20" : "opacity-80 hover:bg-white/10"
                    )}
                  >
                    {Icon && <Icon className="h-5 w-5" />}
                  </button>
                );
              })}
            </nav>

            <Link
              href="/settings/profile"
              title={userName}
              className="mb-4 flex shrink-0 items-center justify-center"
            >
              {avatarSrc ? (
                <div className="h-10 w-10 overflow-hidden rounded-full bg-white/10 ring-2 ring-white/15">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarSrc} alt={userName} className="h-full w-full object-cover object-top" />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning text-xs font-bold text-primary ring-2 ring-white/15">
                  {initials}
                </div>
              )}
            </Link>
          </>
        ) : (
          <>
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
          </>
        )}
      </aside>

      {/* Flyout for the currently-open compact-rail group. Rendered as a
          sibling of <aside>, fixed at RAIL_WIDTH from the left, so the rail's
          own scroll container can never clip it (see the click-outside
          effect above for why that matters). */}
      {compact && openGroupData && (
        <div
          ref={flyoutRef}
          className="mood-sidebar fixed inset-y-0 z-50 w-56 overflow-y-auto border-r border-white/10 bg-primary p-3 text-primary-foreground shadow-xl"
          style={{ left: RAIL_WIDTH }}
          data-ui-mood={uiMood}
        >
          <p className="px-2 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wide opacity-60">
            {openGroupData.label}
          </p>
          <div className="space-y-0.5">
            {openGroupData.items.map((item) => {
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
        </div>
      )}
    </>
  );
}
