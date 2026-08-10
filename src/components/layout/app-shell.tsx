"use client";
import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { UserRole } from "@prisma/client";

/**
 * Holds the mobile drawer open/close state that Sidebar and Topbar's
 * hamburger button both need to share — AppLayout itself is a Server
 * Component (it awaits requireUser()), so this client boundary is what lets
 * a menu tap in Topbar actually open Sidebar.
 */
export function AppShell({
  role, userName, children,
}: { role: UserRole; userName: string; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-secondary">
      <Sidebar role={role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar userName={userName} role={role} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
