import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  FileText,
  FolderOpen,
  Receipt,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommandQuickLink } from "@/lib/project-command";

/**
 * Tautan Cepat Modul.
 *
 * Semua tautan di sini menuju modul yang SUDAH ADA, disaring untuk proyek
 * ini. Tidak ada satu pun layar baru yang perlu dipelajari ulang — itu
 * seluruh alasan blok ini dibuat: Command Center menjawab "sedang di mana",
 * lalu menyerahkan pekerjaannya ke modul yang sudah dikenal.
 *
 * Ikon dipetakan dari label, bukan dikirim dari lapisan data, supaya data
 * proyek tidak perlu tahu apa-apa soal tampilan.
 */

const iconFor: Record<string, LucideIcon> = {
  Costing: Calculator,
  Penawaran: FileText,
  "PO vendor": ShoppingCart,
  "Biaya proyek": Receipt,
  Invoice: Wallet,
  Dokumen: FolderOpen,
};

export function ProjectQuickLinks({ links }: { links: CommandQuickLink[] }) {
  if (links.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Buka modul</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Semua tautan menuju modul yang sudah dipakai selama ini, disaring untuk
          proyek ini.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {links.map((link) => {
          const Icon = iconFor[link.label] ?? FileText;
          return (
            <Link
              key={link.label}
              href={link.href}
              className="group flex flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted"
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 md:opacity-0" />
              </div>
              <p className="truncate text-sm font-medium">{link.label}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {link.count !== undefined ? `${link.count} dokumen` : "Buka"}
                </span>
                {/* Petunjuk seperti "5 menunggu" ditandai, bukan sekadar teks
                    abu-abu: inilah yang membuat orang mengklik. */}
                {link.hint && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                    {link.hint}
                  </Badge>
                )}
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
