"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead, markNotificationRead } from "@/server/notifications";
import { Bell, BellOff, Upload, ShieldCheck, AlertTriangle, CalendarClock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

// Icons are chosen per notification TYPE rather than per severity: people
// learn to recognise "the upload one" or "the approval one" at a glance, and
// that recognition is lost if the same event changes appearance over time.
const TYPE_ICON: Record<string, typeof Bell> = {
  DOCUMENT_IMPORT: Upload,
  QUOTATION_APPROVAL: ShieldCheck,
  VENDOR_PO_APPROVAL: ShieldCheck,
  INVOICE_APPROVAL: ShieldCheck,
  EXPENSE_APPROVAL: ShieldCheck,
  INVOICE_OVERDUE: AlertTriangle,
  CONTRACT_EXPIRING: CalendarClock,
  PROJECT_DEADLINE: CalendarClock,
  PROJECT_CLOSING_INCOMPLETE: AlertTriangle,
};

function relativeTime(d: Date): string {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function NotificationsPanel({
  items,
  unreadCount,
}: {
  items: NotificationRow[];
  unreadCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const shown = expanded ? items : items.slice(0, 4);

  function readOne(id: string) {
    startTransition(async () => { await markNotificationRead(id); router.refresh(); });
  }
  function readAll() {
    startTransition(async () => { await markAllNotificationsRead(); router.refresh(); });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" /> Pemberitahuan
          {unreadCount > 0 && <Badge variant="default" className="text-[10px]">{unreadCount} baru</Badge>}
        </CardTitle>
        {unreadCount > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={readAll} disabled={pending}>
            Tandai sudah dibaca
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BellOff className="h-4 w-4" /> Belum ada pemberitahuan.
          </div>
        )}

        {shown.map((n) => {
          const Icon = TYPE_ICON[n.type] ?? Info;
          const body = (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                n.isRead ? "border-border bg-transparent" : "border-primary/25 bg-primary/[0.04]"
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", n.isRead ? "text-muted-foreground" : "text-primary")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("truncate text-sm", !n.isRead && "font-medium")}>{n.title}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{n.message}</p>
              </div>
              {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
            </div>
          );

          return n.link ? (
            <Link key={n.id} href={n.link} onClick={() => !n.isRead && readOne(n.id)} className="block hover:opacity-90">
              {body}
            </Link>
          ) : (
            <button key={n.id} type="button" onClick={() => !n.isRead && readOne(n.id)} className="block w-full text-left hover:opacity-90">
              {body}
            </button>
          );
        })}

        {items.length > 4 && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-primary hover:underline">
            {expanded ? "Tampilkan lebih sedikit" : `Tampilkan ${items.length - 4} lainnya`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
