import { requireUser } from "@/lib/auth/current-user";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastProvider } from "@/components/ui/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();

  return (
    <ToastProvider>
      <div className="flex h-screen bg-secondary">
        <Sidebar role={session.role} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar userName={session.name} role={session.role} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
