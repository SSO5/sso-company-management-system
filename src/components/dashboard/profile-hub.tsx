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
        <div className={cn("relative flex flex-col gap-6 sm:flex-row sm:items-end", bgSrc && "-mt-20 sm:-mt-28")}>
          {avatarSrc ? (
            // Rounded-square clip (not a circle) lives on this wrapper
            // (overflow-hidden), not on the <img> itself — border-radius
            // applied directly to a replaced element (img) together with
            // object-fit is unreliable on WebKit/Safari and can paint only
            // part of the shape. A wrapper div is the resilient way to clip it.
            <div className="h-40 w-40 shrink-0 overflow-hidden rounded-3xl border-4 border-card bg-muted shadow-md sm:h-64 sm:w-64">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarSrc} alt={p.name} className="h-full w-full object-cover object-top" />
            </div>
          ) : (
            <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-3xl border-4 border-card bg-primary text-5xl font-bold text-primary-foreground shadow-md sm:h-64 sm:w-64 sm:text-6xl">
              {initials}
            </div>
          )}

          <div className="min-w-0 flex-1 sm:pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-bold">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.title ? `${p.title} · ` : ""}{p.role.replace("_", " ")} · {daysSince(p.createdAt)} hari aktif di sistem
                </p>
              </div>
              <Link href="/settings/profile" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent" title="Edit Profil">
                <Pencil className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> {p.email}</span>
              {p.whatsappNumber && <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> {p.whatsappNumber}</span>}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-6 border-t border-border pt-4">
              <div>
                <p className="text-xs text-muted-foreground">Tugas Saya</p>
                <p data-tabular className="text-2xl font-semibold">{p.taskCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{p.projectCountLabel}</p>
                <p data-tabular className="text-2xl font-semibold">{p.projectCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Notifikasi Belum Dibaca</p>
                <p data-tabular className="text-2xl font-semibold">{p.unreadNotifications}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
