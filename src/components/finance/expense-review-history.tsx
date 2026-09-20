import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  REVIEW_EVENT_LABEL,
  sortReviewHistory,
  type ReviewEvent,
  type ReviewEventType,
} from "@/lib/expense-review";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Riwayat satu draf biaya: apa yang sudah terjadi, oleh siapa, kapan.
 *
 * Diurutkan dari yang PALING LAMA — berbeda dari antrean, yang menjawab "apa
 * berikutnya" dan karena itu menaruh yang terbaru di atas. Riwayat menjawab
 * "apa yang sudah terjadi", dan cerita dibaca dari awal; membalik urutannya
 * memaksa pembacanya merangkai sendiri dari belakang.
 *
 * Peristiwa koreksi membawa nilai sebelum dan sesudahnya. Tanpa itu, baris
 * "dikoreksi peninjau" hanya memberi tahu bahwa sesuatu berubah — dan
 * pertanyaan pertama siapa pun yang membacanya adalah "berubah dari berapa".
 */

const TONE: Record<ReviewEventType, string> = {
  DIBUAT: "bg-muted",
  DIAJUKAN: "bg-primary",
  DIKOREKSI: "bg-warning",
  DISETUJUI: "bg-success",
  DITOLAK: "bg-destructive",
  DIBAYAR: "bg-success",
};

export function ExpenseReviewHistory({ events }: { events: ReviewEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Belum ada peristiwa tercatat untuk biaya ini.
      </p>
    );
  }

  const urut = sortReviewHistory(events);

  return (
    <ol className="space-y-2">
      {urut.map((e, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE[e.type])}
            aria-hidden
          />
          <div className="min-w-0 space-y-0.5">
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-medium">{REVIEW_EVENT_LABEL[e.type]}</span>
              <span className="text-muted-foreground">
                {e.by} · {formatDateTime(e.at)}
              </span>
              {e.type === "DIKOREKSI" && (
                <Badge variant="warning">diubah orang lain</Badge>
              )}
            </p>

            {e.note && (
              <p className="break-words text-[11px] text-muted-foreground">
                {e.note}
              </p>
            )}

            {/* Pertanyaan pertama siapa pun yang membaca "dikoreksi" adalah
                "berubah dari berapa". Dijawab di barisnya sendiri. */}
            {e.changes?.map((c) => (
              <p
                key={c.label}
                className="flex flex-wrap items-center gap-1 text-[11px]"
              >
                <span className="text-muted-foreground">{c.label}:</span>
                <span className="text-muted-foreground line-through">{c.before}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{c.after}</span>
              </p>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
