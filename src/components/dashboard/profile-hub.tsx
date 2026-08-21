import Link from "next/link";
import { Alex_Brush } from "next/font/google";
import { brandingUrl, cn } from "@/lib/utils";
import { Pencil, Mail, Phone } from "lucide-react";

// Signature-style display face for the person's name only — every other
// label/value on this card stays in the app's normal sans font. Alex Brush
// (an elegant calligraphic script, not a bubbly casual one) reads as a
// premium hand-signature rather than a logo font. Self-hosted by next/font
// at build time (no runtime fetch to Google Fonts).
const signatureFont = Alex_Brush({ weight: "400", subsets: ["latin"], display: "swap" });

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
        {/* Overlap into the hero band above is a small FIXED amount, not
            scaled with the avatar's own size — the band itself
            (h-36 sm:h-48) doesn't grow when the avatar does, so a
            margin that scaled with avatar height would eventually push
            the avatar's top edge above the band entirely and over the
            page header behind it. A modest, fixed overlap keeps the
            avatar's top comfortably inside the band no matter how big
            the avatar gets — the rest of it just extends further down
            into the normal content flow below. */}
        <div className={cn("relative flex flex-col gap-8 sm:flex-row sm:items-end", bgSrc && "-mt-12 sm:-mt-16")}>
          {avatarSrc ? (
            // Rounded-square clip (not a circle) lives on this wrapper
            // (overflow-hidden), not on the <img> itself — border-radius
            // applied directly to a replaced element (img) together with
            // object-fit is unreliable on WebKit/Safari and can paint only
            // part of the shape. A wrapper div is the resilient way to clip it.
            <div className="h-80 w-80 shrink-0 overflow-hidden rounded-3xl border-4 border-card bg-muted shadow-md sm:h-[32rem] sm:w-[32rem]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarSrc} alt={p.name} className="h-full w-full object-cover object-top" />
            </div>
          ) : (
            <div className="flex h-80 w-80 shrink-0 items-center justify-center rounded-3xl border-4 border-card bg-primary text-6xl font-bold text-primary-foreground shadow-md sm:h-[32rem] sm:w-[32rem] sm:text-8xl">
              {initials}
            </div>
          )}

          <div className="min-w-0 flex-1 sm:pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-block">
                  <p className={cn(signatureFont.className, "whitespace-nowrap text-[40px] leading-none text-[#2454d1] sm:text-[56px]")}>{p.name}</p>
                  {/* Hand-drawn swash under the signature-style name — purely
                      decorative, so it's aria-hidden and the name itself
                      stays the one accessible text node. */}
                  <svg aria-hidden="true" viewBox="0 0 400 22" preserveAspectRatio="none" className="-mt-1 h-3.5 w-full sm:h-5">
                    <path
                      fill="#ee5a93"
                      d="M0,14 C 60,2 100,20 160,10 C 220,0 260,18 320,8 C 350,3 375,9 400,4
                         L400,10 C 375,15 350,9 320,14 C 260,24 220,6 160,16 C 100,26 60,8 0,20 Z"
                    />
                  </svg>
                </div>
                <p className="text-base text-muted-foreground">
                  {p.title ? `${p.title} · ` : ""}{p.role.replace("_", " ")} · {daysSince(p.createdAt)} hari aktif di sistem
                </p>
              </div>
              <Link href="/settings/profile" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent" title="Edit Profil">
                <Pencil className="h-5 w-5" />
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-base text-muted-foreground">
              <span className="flex items-center gap-2"><Mail className="h-5 w-5" /> {p.email}</span>
              {p.whatsappNumber && <span className="flex items-center gap-2"><Phone className="h-5 w-5" /> {p.whatsappNumber}</span>}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-8 border-t border-border pt-5">
              <div>
                <p className="text-sm text-muted-foreground">Tugas Saya</p>
                <p data-tabular className="text-4xl font-semibold">{p.taskCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{p.projectCountLabel}</p>
                <p data-tabular className="text-4xl font-semibold">{p.projectCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Notifikasi Belum Dibaca</p>
                <p data-tabular className="text-4xl font-semibold">{p.unreadNotifications}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
