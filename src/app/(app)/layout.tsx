import { requireUser } from "@/lib/auth/current-user";
import { getUnreadNotificationCount } from "@/server/notifications";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, unreadCount] = await Promise.all([requireUser(), getUnreadNotificationCount()]);

  return (
    <ToastProvider>
      <AppShell role={session.role} userName={session.name} unreadCount={unreadCount}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
