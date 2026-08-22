import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { getUnreadNotificationCount } from "@/server/notifications";
import { getThemeSettings } from "@/server/settings/theme";
import { getThemePreset } from "@/lib/theme-presets";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { AssistantWidget } from "@/components/assistant/assistant-widget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, unreadCount, theme] = await Promise.all([
    requireUser(),
    getUnreadNotificationCount(),
    getThemeSettings(),
  ]);
  // Not carried in the session cookie (see session.ts's SessionPayload) —
  // it's mutable via self-service Profil Saya, so it's read fresh on every
  // request instead of going stale until the 12h cookie re-issues.
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { avatarUrl: true } });
  const preset = getThemePreset(theme.themePreset);

  return (
    <ToastProvider>
      {/* Settings > Tema (CompanySettings.themePreset): overrides globals.css's
          --primary/--ring for the whole authenticated app. Only the brand
          color moves — success/warning/destructive stay put on purpose, see
          lib/theme-presets.ts. */}
      <style>{`:root { --primary: ${preset.primary}; --ring: ${preset.ring}; }`}</style>
      <AppShell role={session.role} userName={session.name} unreadCount={unreadCount} avatarUrl={user?.avatarUrl ?? null}>
        {children}
      </AppShell>
      <AssistantWidget />
    </ToastProvider>
  );
}
