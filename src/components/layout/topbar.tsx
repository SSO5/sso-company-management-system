"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, LogOut, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Topbar({ userName, role }: { userName: string; role: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-5">
      <form onSubmit={onSearchSubmit} className="flex w-full max-w-md items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers, quotations, projects, invoices..."
          className="h-8 border-0 shadow-none focus-visible:ring-0"
        />
      </form>
      <div className="flex items-center gap-4">
        <button className="relative rounded-md p-2 hover:bg-accent" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </button>
        <div className="text-right leading-tight">
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
