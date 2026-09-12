import Link from "next/link";
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

/**
 * Halaman "Semua Modul": grid ikon berwarna, disusun mengikuti urutan kerja
 * perusahaan dan disaring per role (lihat lib/launcher.ts).
 *
 * Ini komponen server murni — tidak ada state, tidak ada efek, jadi tidak
 * perlu "use client". Seluruhnya terkirim sebagai HTML.
 */
export function AppLauncher({
  role,
  counts,
}: {
  role: UserRole;
  /**
   * Lencana angka per href, diambil pemanggil dari data yang memang sudah
   * dihitung untuk dashboard. Hanya diisi untuk hal yang BUTUH TINDAKAN —
   * lencana pada sesuatu yang cuma "ada isinya" melatih orang mengabaikannya.
   */
  counts?: Record<string, { value: number; tone: "urgent" | "attention" }>;
}) {
  const sections = launcherForRole(role);

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.label}>
          <div className="mb-4 flex items-center gap-2.5">
            {section.step && (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {section.step}
              </span>
            )}
            <h2 className="text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
              {section.label}
            </h2>
            <span className="hidden truncate text-xs text-muted-foreground/70 sm:block">{section.hint}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {section.tiles.map((tile) => {
              const Icon = ICONS[tile.icon] ?? FileText;
              const badge = counts?.[tile.href];
              return (
                <Link
                  key={tile.href}
                  href={tile.href}
                  title={tile.hint}
                  className="group flex flex-col items-center gap-2.5 rounded-lg p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="relative">
                    <span
                      // Warna datang dari data, bukan kelas Tailwind: daftar
                      // warnanya hidup di lib/launcher.ts supaya satu berkas
                      // itu saja yang perlu dibaca untuk tahu tampilan grid.
                      style={{ backgroundColor: tile.color }}
                      className="flex h-[58px] w-[58px] items-center justify-center rounded-2xl shadow-[0_2px_5px_0_rgb(16_24_40/0.13)] transition-transform duration-200 group-hover:-translate-y-0.5 group-active:translate-y-0"
                    >
                      <Icon className="h-[26px] w-[26px] text-white" strokeWidth={2} />
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
                  <span className="text-xs font-medium leading-tight">{tile.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
