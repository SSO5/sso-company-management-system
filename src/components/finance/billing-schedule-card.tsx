import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { BillingScheduleRow } from "@/lib/workflows/calculations";
import { CalendarClock } from "lucide-react";

/**
 * One shared card for the "next billing schedule" — same computeBillingSchedule
 * data, rendered full (Accounts Receivable) or compact (Invoices, Payments,
 * Dashboard) so all four screens the founder wanted this on stay in sync
 * instead of drifting into four different implementations.
 */
export function BillingScheduleCard({
  rows,
  compact = false,
  title = "Jadwal Penagihan Berikutnya",
}: {
  rows: BillingScheduleRow[];
  compact?: boolean;
  title?: string;
}) {
  if (rows.length === 0) return null;

  const shown = compact ? rows.slice(0, 4) : rows;
  const totalRemaining = rows.reduce((s, r) => s + r.remainingToBill, 0);
  const now = new Date();

  function urgency(date: Date | null): "overdue" | "soon" | "scheduled" | "unscheduled" {
    if (!date) return "unscheduled";
    if (date < now) return "overdue";
    const days = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return days <= 7 ? "soon" : "scheduled";
  }
  const URGENCY_STYLE: Record<string, string> = {
    overdue: "bg-destructive/15 text-destructive",
    soon: "bg-warning/15 text-warning",
    scheduled: "bg-muted text-muted-foreground",
    unscheduled: "bg-muted text-muted-foreground",
  };
  const URGENCY_LABEL: Record<string, string> = {
    overdue: "Lewat target", soon: "Segera", scheduled: "Terjadwal", unscheduled: "Belum ada tanggal",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" /> {title}
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {formatCurrency(totalRemaining)} belum ditagih · {rows.length} project
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {shown.map((r) => {
          const u = urgency(r.nextBillingDate);
          return (
            <Link
              key={r.projectId}
              href={`/projects/${r.projectId}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{r.customerName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.projectNumber}
                  {r.pos.length > 0 && ` · ${r.pos.map((po) => po.number).join(", ")}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-medium">{formatCurrency(r.remainingToBill)}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", URGENCY_STYLE[u])}>
                  {r.nextBillingDate ? formatDate(r.nextBillingDate) : URGENCY_LABEL[u]}
                </span>
              </div>
            </Link>
          );
        })}
        {compact && rows.length > shown.length && (
          <Link href="/finance/receivables" className="block text-xs text-primary hover:underline">
            Lihat {rows.length - shown.length} project lainnya →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
