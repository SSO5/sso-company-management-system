import { requireUser } from "@/lib/auth/current-user";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();

  return (
    <ToastProvider>
      <AppShell role={session.role} userName={session.name}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
