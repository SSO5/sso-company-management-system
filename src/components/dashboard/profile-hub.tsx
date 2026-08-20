import Link from "next/link";
import { brandingUrl, cn } from "@/lib/utils";
import { Pencil, Mail, Phone } from "lucide-react";

interface ProfileHubProps {
  name: string;
  role: string;
  title: string | null;
  email: string;
  whatsappNumber: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  taskCount: number;
  projectCount: number;
  projectCountLabel: string;
  unreadNotifications: number;
  backgroundUrl: string | null;
}

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * "Aktivitas Saya" hub: who's signed in, what they do, and three numbers
 * that make their workload legible at a glance — the dashboard's opening
 * beat before the task list and company-wide numbers below it. Every stat
 * here is real (see dashboard/page.tsx's callers), never a placeholder.
 */
export function ProfileHub(p: ProfileHubProps) {
  const avatarSrc = brandingUrl(p.avatarUrl);
  const bgSrc = brandingUrl(p.backgroundUrl);
  const initials = p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="rounded-xl border border-border/70 bg-card">
      {bgSrc && (
        <div className="relative h-36 overflow-hidden rounded-t-xl sm:h-48">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgSrc} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-card" />
        </div>
      )}
      {/* Avatar sits OUTSIDE the hero band's own overflow-hidden wrapper
          above (not inside it) so it's never clipped by the band's rounded
          corners — it overlaps on top, in normal flow, via negative margin.
          The hero band above is `position: relative` (it needs to be, as the
          containing block for its absolute gradient overlay), and a
          positioned element always paints above normal-flow siblings
          regardless of DOM order — so without `relative` here too, the hero
          band paints over the top half of this overlapping row instead of
          under it. `relative` promotes this row into the same stacking
          phase, where DOM order (this row comes after) wins instead. */}
      <div className={bgSrc ? "bg-card px-5 pb-5 sm:px-6" : "p-5 sm:p-6"}>
        <div className={cn("relative flex flex-col gap-5 sm:flex-row sm:items-end", bgSrc && "-mt-16 sm:-mt-20")}>
          {avatarSrc ? (
            // Circular clip lives on this wrapper (overflow-hidden), not on
            // the <img> itself — border-radius applied directly to a replaced
            // element (img) together with object-fit is unreliable on
            // WebKit/Safari and can paint only part of the circle. A wrapper
            // div is the resilient way to clip it.
            <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full border-4 border-card bg-muted shadow-md sm:h-[168px] sm:w-[168px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarSrc} alt={p.name} className="h-full w-full object-cover object-top" />
            </div>
          ) : (
            <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-4 border-card bg-primary text-4xl font-bold text-primary-foreground shadow-md sm:h-[168px] sm:w-[168px]">
              {initials}
            </div>
          )}

          <div className="min-w-0 flex-1 sm:pb-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.title ? `${p.title} · ` : ""}{p.role.replace("_", " ")} · {daysSince(p.createdAt)} hari aktif di sistem
                </p>
              </div>
              <Link href="/settings/profile" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent" title="Edit Profil">
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {p.email}</span>
              {p.whatsappNumber && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {p.whatsappNumber}</span>}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Tugas Saya</p>
                <p data-tabular className="text-lg font-semibold">{p.taskCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">{p.projectCountLabel}</p>
                <p data-tabular className="text-lg font-semibold">{p.projectCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Notifikasi Belum Dibaca</p>
                <p data-tabular className="text-lg font-semibold">{p.unreadNotifications}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
