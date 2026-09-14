import { listActivityLog } from "@/server/activity-log";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export default async function ActivityLogPage() {
  const logs = await listActivityLog();
  return (
    <div className="space-y-4">
      <div><p className="workspace-eyebrow">Jejak perubahan sistem</p><h1 className="text-xl font-semibold">Log aktivitas</h1><p className="text-sm text-muted-foreground">Menampilkan siapa melakukan apa dan kapan, untuk {logs.length} aktivitas terbaru.</p></div>
      <div className="space-y-1">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start justify-between rounded-md border border-border px-3 py-2 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>{" "}
              <span className="font-medium">{log.user?.name ?? "Sistem"}</span> — {log.description}
            </div>
            <Badge variant="outline">{log.action.replace("_", " ")}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
