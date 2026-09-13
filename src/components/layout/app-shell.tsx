"use client";
import { RouteMotion } from "./route-motion";
import "./workspace.css";
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
  role,
  userName,
  unreadCount,
  avatarUrl,
  uiMood,
  children,
}: {
  role: UserRole;
  userName: string;
  unreadCount: number;
  avatarUrl: string | null;
  uiMood: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="command-shell flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:bg-white focus:p-4"
      >
        Lewati ke isi
      </a>
      <Sidebar
        role={role}
        userName={userName}
        avatarUrl={avatarUrl}
        uiMood="default"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="command-canvas flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          userName={userName}
          role={role}
          avatarUrl={avatarUrl}
          unreadCount={unreadCount}
          uiMood="default"
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main id="main-content" className="command-main flex-1 overflow-y-auto">
          <RouteMotion>{children}</RouteMotion>
        </main>
      </div>
    </div>
  );
}
