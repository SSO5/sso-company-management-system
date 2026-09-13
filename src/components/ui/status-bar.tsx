import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusFlowState } from "@/lib/status-flow";

/**
 * Jalur tahapan yang tampil di kanan atas sebuah dokumen — gaya statusbar
 * Odoo: seluruh perjalanan terlihat sekaligus, bukan cuma satu lencana
 * berisi satu kata.
 *
 * Bedanya dengan lencana lama: sebuah lencana bertuliskan "APPROVED" hanya
 * memberi tahu keadaan sekarang. Jalur ini sekaligus memberi tahu apa yang
 * sudah lewat dan APA LANGKAH BERIKUTNYA — pertanyaan yang paling sering
 * ditanyakan orang saat membuka penawaran milik orang lain.
 *
 * Ini komponen tampilan murni: tidak ada tombol, tidak ada aksi. Memindah
 * status tetap lewat tombol di sebelah kiri, yang izinnya diperiksa di
 * server. Membuat tahapnya bisa diklik akan menggoda orang melompati
 * persetujuan, dan itu justru yang dijaga alur ini.
 */
export function StatusBar({ flow, className }: { flow: StatusFlowState; className?: string }) {
  const { stages, currentIndex, reachedIndex, terminal } = flow;

  return (
    <div
      className={cn(
        // Pada layar sempit jalurnya digeser, bukan dipatahkan jadi dua baris:
        // urutan kiri-ke-kanan itu sendiri bagian dari maknanya.
        "-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      aria-label="Tahapan dokumen"
    >
      {stages.map((stage, i) => {
        const isCurrent = i === currentIndex;
        const isPassed = i < reachedIndex || (terminal && i <= reachedIndex);
        return (
          <div key={stage.key} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-border" />}
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex h-7 items-center whitespace-nowrap rounded-full px-3.5 text-xs transition-colors",
                isCurrent && "bg-primary px-4 font-semibold text-primary-foreground",
                !isCurrent && isPassed && "bg-muted font-medium text-muted-foreground",
                // Tahap yang belum dijalani digambar dengan garis putus-putus:
                // bentuknya saja sudah mengatakan "belum terjadi", tanpa perlu
                // dibaca.
                !isCurrent && !isPassed && "border border-dashed border-border font-medium text-muted-foreground/70"
              )}
            >
              {stage.label}
            </span>
          </div>
        );
      })}

      {terminal && (
        <div className="flex shrink-0 items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-border" />
          <span
            aria-current="step"
            className={cn(
              "flex h-7 items-center whitespace-nowrap rounded-full px-4 text-xs font-semibold",
              terminal.tone === "danger"
                ? "bg-destructive text-destructive-foreground"
                : "bg-muted-foreground/15 text-muted-foreground"
            )}
          >
            {terminal.label}
          </span>
        </div>
      )}
    </div>
  );
}
