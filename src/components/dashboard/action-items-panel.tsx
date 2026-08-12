import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { ActionItem, ActionItemModule, ActionItemSeverity } from "@/server/action-items";
import { CheckCircle2, AlertCircle, Clock, ShieldCheck } from "lucide-react";

const SEVERITY_META: Record<ActionItemSeverity, { label: string; icon: typeof AlertCircle; className: string }> = {
  overdue: { label: "Terlambat", icon: AlertCircle, className: "border-destructive/30 bg-destructive/10 text-destructive" },
  pending_approval: { label: "Menunggu persetujuan Anda", icon: ShieldCheck, className: "border-primary/30 bg-primary/10 text-primary" },
  due_soon: { label: "Segera jatuh tempo", icon: Clock, className: "border-warning/30 bg-warning/10 text-warning" },
  attention: { label: "Perlu diperiksa", icon: AlertCircle, className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
};

// Labels follow the nav, not the database. The sidebar says "Pekerjaan" and
// "Keuangan", so a badge reading "Procurement" sends someone hunting for a
// menu that no longer exists under that name.
const MODULE_LABEL: Record<ActionItemModule, string> = {
  sales: "Penawaran", finance: "Keuangan", project: "Proyek", procurement: "Vendor",
};

/**
 * "To-do list per jobdes" (spec, Aug 2026): renders getMyActionItems() —
 * every item here is derived live from Quotation/VendorPO/Expense/Invoice/
 * Milestone/ProgressReport state, scoped to what the signed-in user's role
 * can act on. Nothing is stored separately, so it can never go stale the
 * way a manually-maintained to-do list would.
 */
export function ActionItemsPanel({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Tugas Saya</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" /> Semua beres — tidak ada item yang butuh tindakan Anda saat ini.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Tugas Saya</CardTitle>
        <Badge variant="outline">{items.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => {
          const meta = SEVERITY_META[item.severity];
          const Icon = meta.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:opacity-80 ${meta.className}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="truncate text-xs opacity-80">{item.subtitle}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.dueDate && <span className="text-xs opacity-80">{formatDate(item.dueDate)}</span>}
                <Badge variant="outline" className="text-[10px]">{MODULE_LABEL[item.module]}</Badge>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
