"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, LogOut, Bell, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Topbar({
  userName, role, onMenuClick,
}: { userName: string; role: string; onMenuClick?: () => void }) {
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
        <button className="relative rounded-md p-2 hover:bg-accent" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </button>
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-medium">{userName}</p>
          <p className="text-[11px] text-muted-foreground">{role.replace("_", " ")}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="rounded-md p-2 hover:bg-accent" aria-label="Log out" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
