"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users, Target, Calculator, FileText, FileCheck,
  Building2, ListChecks, FolderOpen, Truck,
  Receipt, Banknote, Clock, Wallet, Building, BookOpen,
  LayoutDashboard, BarChart3, UserCog, Hash, LifeBuoy, History,
  type LucideIcon,
} from "lucide-react";
import { launcherForRole } from "@/lib/launcher";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

const ICONS: Record<string, LucideIcon> = {
  Users, Target, Calculator, FileText, FileCheck,
  Building2, ListChecks, FolderOpen, Truck,
  Receipt, Banknote, Clock, Wallet, Building, BookOpen,
  LayoutDashboard, BarChart3, UserCog, Hash, LifeBuoy, History,
};

/** Lama animasi keluar sebelum pindah halaman. Harus PENDEK — gerakan yang
 *  terasa mewah sekali akan terasa lambat pada klik kesepuluh hari itu. */
const EXIT_MS = 260;

export function AppLauncher({
  role,
  counts,
}: {
  role: UserRole;
  counts?: Record<string, { value: number; tone: "urgent" | "attention" }>;
}) {
  const sections = launcherForRole(role);
  const router = useRouter();
  const [leaving, setLeaving] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /**
   * "Masuk ke ruangan baru": saat satu ikon diklik, seluruh grid mundur dan
   * memudar sementara ikon yang ditekan justru maju membesar — seolah kamera
   * bergerak menembusnya. Begitu selesai, halaman tujuan masuk dengan animasi
   * room-enter di globals.css, jadi gerakannya menyambung jadi satu.
   *
   * Tautannya tetap <Link href> sungguhan: klik tengah, Ctrl+klik, dan
   * keyboard tetap bekerja seperti tautan biasa. Hanya klik kiri polos yang
   * ditahan sebentar untuk memutar animasinya.
   */
  function onTileClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    // Hormati orang yang mual melihat gerakan — langsung pindah tanpa jeda.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    e.preventDefault();
    setLeaving(href);
    // Prefetch sudah jalan sejak <Link> terlihat, jadi jeda ini dipakai untuk
    // animasi, bukan untuk menunggu data.
    window.setTimeout(() => startTransition(() => router.push(href)), EXIT_MS);
  }

  return (
    <div
      className={cn(
        "space-y-11 transition-[opacity,transform] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        leaving && "scale-[0.97] opacity-0"
      )}
    >
      {sections.map((section) => (
        <section key={section.label}>
          {/* Judul di tengah, diapit garis tipis yang memudar ke tepi. Ini
              memberi tiap tahap kesan babak tersendiri, bukan sekadar daftar
              yang disambung. */}
          <div className="mb-7 flex flex-col items-center">
            <div className="flex w-full items-center gap-4">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
              <div className="flex shrink-0 items-center gap-2.5">
                {section.step && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {section.step}
                  </span>
                )}
                <h2 className="mood-heading text-[15px] font-semibold tracking-tight">{section.label}</h2>
              </div>
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">{section.hint}</p>
          </div>

          <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-x-3 gap-y-7">
            {section.tiles.map((tile) => {
              const Icon = ICONS[tile.icon] ?? FileText;
              const badge = counts?.[tile.href];
              const isTarget = leaving === tile.href;
              return (
                <Link
                  key={tile.href}
                  href={tile.href}
                  title={tile.hint}
                  onClick={(e) => onTileClick(e, tile.href)}
                  className={cn(
                    "group flex w-[104px] flex-col items-center gap-2.5 rounded-xl p-1 text-center",
                    "transition-[transform,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    // Ikon yang ditekan maju membesar sementara sisanya mundur.
                    isTarget && "z-10 scale-[1.22]",
                    leaving && !isTarget && "scale-95 opacity-0"
                  )}
                >
                  <span className="relative">
                    <span
                      style={{ backgroundColor: tile.color }}
                      className={cn(
                        "flex h-16 w-16 items-center justify-center rounded-[20px]",
                        "shadow-[0_3px_8px_0_rgb(16_24_40/0.16)]",
                        "transition-[transform,box-shadow] duration-200",
                        "group-hover:-translate-y-1 group-hover:shadow-[0_8px_18px_0_rgb(16_24_40/0.22)]",
                        "group-active:translate-y-0 group-active:shadow-[0_2px_5px_0_rgb(16_24_40/0.16)]"
                      )}
                    >
                      <Icon className="h-7 w-7 text-white" strokeWidth={1.9} />
                    </span>
                    {badge && badge.value > 0 && (
                      <span
                        className={cn(
                          "absolute -right-1.5 -top-1.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-background px-1 text-[11px] font-bold leading-none",
                          badge.tone === "urgent"
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-warning text-warning-foreground"
                        )}
                      >
                        {badge.value > 99 ? "99+" : badge.value}
                      </span>
                    )}
                  </span>
                  <span className="text-[12.5px] font-medium leading-tight">{tile.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
