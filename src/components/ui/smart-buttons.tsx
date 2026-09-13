import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * "Smart button" gaya Odoo: kotak kecil berisi ANGKA di atas dan nama relasi
 * di bawah, tepat di kepala dokumen.
 *
 * Gunanya satu hal saja — menjawab "dokumen ini nyantol ke apa lagi?" tanpa
 * harus menggulir sampai bawah halaman. Angkanya sekaligus jadi peringatan:
 * "PO Pelanggan 0" pada penawaran yang sudah Terkirim langsung terbaca
 * sebagai pekerjaan yang belum selesai.
 *
 * Aturan yang dipegang di sini: JANGAN menampilkan tombol untuk relasi yang
 * memang tidak mungkin ada pada dokumen ini. Deretan angka nol cuma melatih
 * orang berhenti membaca bagian ini.
 */
export interface SmartButtonItem {
  label: string;
  value: number | string;
  icon: LucideIcon;
  href?: string;
  /** Ditandai saat angkanya berarti ada yang belum dikerjakan. */
  alert?: boolean;
  title?: string;
}

export function SmartButtons({ items, className }: { items: SmartButtonItem[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const body = (
          <>
            <Icon className={cn("h-[18px] w-[18px] shrink-0", item.alert ? "text-warning" : "text-primary")} strokeWidth={1.9} />
            <span className="text-left leading-tight">
              <span className="block text-base font-bold tabular-nums">{item.value}</span>
              <span className="block text-[11px] text-muted-foreground">{item.label}</span>
            </span>
          </>
        );
        const shared = cn(
          "flex min-w-[112px] items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-card-foreground",
          item.alert ? "border-warning/40 bg-warning/5" : "border-border"
        );

        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            title={item.title}
            className={cn(
              shared,
              "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_0_rgb(16_24_40/0.10)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            {body}
          </Link>
        ) : (
          <div key={item.label} title={item.title} className={shared}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
