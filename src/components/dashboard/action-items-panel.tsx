import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { ActionItem } from "@/server/action-items";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
const labels = {
  overdue: "Terlambat",
  pending_approval: "Persetujuan",
  due_soon: "Segera",
  attention: "Periksa",
};
const modules = {
  sales: "Penjualan",
  finance: "Keuangan",
  project: "Proyek",
  procurement: "Vendor",
};
export function ActionItemsPanel({
  items,
  limit = 50,
  title = "Tindak lanjut",
}: {
  items: ActionItem[];
  limit?: number;
  title?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <span className="workspace-pill">{items.length} tindakan</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 size={20} className="shrink-0" />
            Tidak ada tindakan otomatis yang menunggu pada kewenangan Anda.
            Penugasan tim tersedia di menu tersendiri.
          </div>
        )}
        {items.slice(0, limit).map((i) => (
          <Link key={i.id} href={i.href} className="workspace-action">
            <div
              className={`h-9 w-1 shrink-0 rounded-full ${i.severity === "overdue" ? "bg-red-500" : i.severity === "pending_approval" ? "bg-blue-500" : "bg-amber-400"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>{modules[i.module]}</span>
                <span>· {labels[i.severity]}</span>
                {i.dueDate && <span>· {formatDate(i.dueDate)}</span>}
              </div>
              <p className="break-words text-sm font-semibold">{i.title}</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {i.subtitle}
              </p>
            </div>
            <ArrowUpRight size={17} className="shrink-0 text-primary" />
          </Link>
        ))}
        {items.length > limit && (
          <Link
            href="/work"
            className="block rounded-xl bg-slate-50 p-3 text-center text-sm text-primary"
          >
            Lihat semua {items.length} tindakan →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
