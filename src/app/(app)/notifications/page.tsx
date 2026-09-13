import { getMyNotifications } from "@/server/notifications";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
export default async function NotificationsPage() {
  const data = await getMyNotifications(100);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="workspace-heading">
        <div>
          <p className="workspace-eyebrow">Pusat notifikasi</p>
          <h1>Pembaruan untuk Anda</h1>
          <p className="workspace-muted mt-2">
            100 pemberitahuan terbaru; yang belum dibaca ditampilkan lebih
            dahulu.
          </p>
        </div>
      </div>
      <NotificationsPanel items={data.items} unreadCount={data.unreadCount} />
    </div>
  );
}
