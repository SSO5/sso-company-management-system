import Link from "next/link";
import { Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  budgetDrift,
  isLocked,
  type BaselineVersion,
} from "@/lib/project-baseline";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

/**
 * Kartu baseline yang sedang berlaku, beserta asalnya.
 *
 * "Asalnya" bukan hiasan. Angka pembanding yang tidak bisa ditelusuri akan
 * diperdebatkan setiap kali proyek terlihat merugi, dan perdebatan itu
 * selalu berakhir dengan orang membuka berkas costing di komputer
 * masing-masing. Jadi kartu ini menyebut nomor costing beserta revisinya,
 * siapa yang menetapkan, kapan, siapa yang mengunci — dan menautkan langsung
 * ke dokumennya kalau costingnya masih ada.
 *
 * Costing yang sudah dihapus tidak membatalkan baseline: baseline adalah
 * SALINAN BEKU, bukan tautan hidup. Yang hilang cuma jalan pintas ke
 * dokumennya, dan itu dikatakan apa adanya.
 */
export function ActiveBaselineCard({
  current,
  projectBudget,
}: {
  current: BaselineVersion;
  projectBudget: number;
}) {
  const drift = budgetDrift({ projectBudget, current });
  const nomor = `${current.costingNumber}${
    current.costingRevision > 0 ? `.R${current.costingRevision}` : ""
  }`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm">Baseline berlaku</CardTitle>
          <Badge variant="secondary">Versi {current.version}</Badge>
          {isLocked(current) ? (
            <Badge variant="success">
              <Lock className="mr-1 h-3 w-3" /> Terkunci
            </Badge>
          ) : (
            <Badge variant="warning">
              <Unlock className="mr-1 h-3 w-3" /> Belum dikunci
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
          <Figure label="Baseline" value={formatCurrency(current.amount)} />
          <Figure label="Pagu proyek saat ini" value={formatCurrency(projectBudget)} />
          <Figure
            label={
              drift === null || drift === 0
                ? "Sama dengan baseline"
                : drift > 0
                  ? "Pagu proyek di atas baseline"
                  : "Pagu proyek di bawah baseline"
            }
            value={drift === null ? "—" : formatCurrency(Math.abs(drift))}
            tone={drift && drift !== 0 ? "bad" : "good"}
          />
        </div>

        {/* Jejak asal-usul: dari dokumen mana, oleh siapa, kapan. */}
        <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
          <Baris label="Dari costing">
            {current.costingId ? (
              <Link
                href={`/sales/costing/${current.costingId}`}
                className="font-mono text-primary hover:underline"
              >
                {nomor}
              </Link>
            ) : (
              <>
                <span className="font-mono">{nomor}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — dokumennya sudah tidak ada, tapi angkanya tetap berlaku karena
                  baseline adalah salinan beku.
                </span>
              </>
            )}
          </Baris>
          <Baris label="Ditetapkan">
            {current.setBy} · {formatDateTime(current.setAt)}
          </Baris>
          <Baris label="Dikunci">
            {current.lockedAt
              ? `${current.lockedBy ?? "—"} · ${formatDateTime(current.lockedAt)}`
              : "Belum dikunci — masih bisa diubah tanpa menambah versi."}
          </Baris>
          <Baris label="Alasan versi ini">{current.reason ?? "—"}</Baris>
        </dl>

        {drift !== null && drift !== 0 && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
            Pagu proyek sudah bergeser {formatCurrency(Math.abs(drift))} dari
            baseline. Papan biaya membandingkan realisasi dengan{" "}
            <strong>pagu proyek</strong>, bukan baseline — jadi selisih ini ikut
            menentukan apakah proyek terlihat aman atau tidak.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Baris({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "break-words text-base font-semibold tabular-nums sm:text-lg",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
