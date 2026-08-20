"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, LogOut, Bell, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { brandingUrl } from "@/lib/utils";

export function Topbar({
  userName, role, avatarUrl, unreadCount = 0, onMenuClick,
}: { userName: string; role: string; avatarUrl: string | null; unreadCount?: number; onMenuClick?: () => void }) {
  const avatarSrc = brandingUrl(avatarUrl);
  const initials = userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="shrink-0 rounded-md p-2 hover:bg-accent md:hidden"
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <form onSubmit={onSearchSubmit} className="flex w-full min-w-0 max-w-md items-center gap-2">
          <Search className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="h-8 min-w-0 border-0 shadow-none focus-visible:ring-0"
          />
        </form>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {/* Used to be a dead placeholder button — no data, no click target.
            Real unread count now, linking to where NotificationsPanel
            actually lives (there's no separate notifications page). */}
        <Link
          href="/dashboard"
          className="relative rounded-md p-2 hover:bg-accent"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} belum dibaca)` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-medium leading-none text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-medium">{userName}</p>
          <p className="text-[11px] text-muted-foreground">{role.replace("_", " ")}</p>
        </div>
        <Link href="/settings/profile" title="Profil Saya">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt={userName} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {initials}
            </div>
          )}
        </Link>
        <form action="/api/auth/logout" method="post">
          <button className="rounded-md p-2 hover:bg-accent" aria-label="Log out" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
