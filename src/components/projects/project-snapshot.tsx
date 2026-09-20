import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DAYS_REMAINING_WARNING,
  remainingBudget,
  type CommandSnapshot,
} from "@/lib/project-command";
import { HEALTH_LABEL, type ProjectHealth } from "@/lib/project-progress";

/**
 * Status dan Progres Sekilas.
 *
 * Empat angka, tidak lebih, karena ini bagian yang dibaca lebih dulu sebelum
 * orang memutuskan mau membuka modul mana: sudah sampai mana pekerjaannya,
 * berapa sisa waktunya, berapa nilainya, dan apakah uangnya masih cukup.
 *
 * Batang di bawahnya adalah progres PEKERJAAN dari milestone, bukan
 * penyerapan biaya — dua hal yang sering tertukar dan menghasilkan kesimpulan
 * yang berlawanan. Perbandingan biaya ada di papan biaya, bukan di sini.
 */
/**
 * Kesehatan hanya ditandai saat ia mengatakan sesuatu. "Sesuai rencana" dan
 * "belum bisa dinilai" tidak diberi badge: penanda yang selalu muncul akan
 * berhenti dibaca, dan yang perlu terlihat justru yang tertinggal.
 */
const healthBadge: Partial<
  Record<ProjectHealth, { label: string; variant: "warning" | "destructive" }>
> = {
  TERTINGGAL: { label: HEALTH_LABEL.TERTINGGAL, variant: "warning" },
  KRITIS: { label: HEALTH_LABEL.KRITIS, variant: "destructive" },
};

export function ProjectSnapshotCard({
  projectName,
  snapshot,
}: {
  projectName: string;
  snapshot: CommandSnapshot;
}) {
  const sisaPagu = remainingBudget(snapshot);
  const progress = Math.min(100, Math.max(0, snapshot.progressPercent));
  const sehat = healthBadge[snapshot.health];
  const waktuMepet =
    snapshot.daysRemaining !== null && snapshot.daysRemaining < DAYS_REMAINING_WARNING;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="min-w-0 break-words">{projectName}</CardTitle>
          <Badge variant={snapshot.status === "ACTIVE" ? "default" : "secondary"}>
            {snapshot.statusLabel}
          </Badge>
          {/* Status dan kesehatan sengaja berdiri berdampingan. Status adalah
              apa yang DIKATAKAN orang tentang proyek ini; kesehatan adalah
              apakah progresnya wajar untuk waktu yang sudah terpakai. Justru
              selisih keduanya yang berguna. */}
          {sehat && <Badge variant={sehat.variant}>{sehat.label}</Badge>}
        </div>
        <p className="break-words font-mono text-[11px] text-muted-foreground">
          {snapshot.number}
          {snapshot.jobNumber ? ` · ${snapshot.jobNumber}` : ""} ·{" "}
          {snapshot.customerName} · PM:{" "}
          {snapshot.projectManager ?? "Belum ditunjuk"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
          <SnapshotFigure
            label="Progres pekerjaan"
            value={`${snapshot.progressPercent}%`}
            hint={
              snapshot.progressSource === "MILESTONE_WEIGHT"
                ? `${snapshot.milestonesDone} dari ${snapshot.milestonesTotal} milestone`
                : "Diisi manual — bobot milestone belum ditetapkan"
            }
          />
          <SnapshotFigure
            label="Sisa waktu"
            value={
              snapshot.daysRemaining === null
                ? "—"
                : `${snapshot.daysRemaining} hari`
            }
            hint={
              snapshot.daysRemaining === null
                ? "Tanggal selesai belum diisi"
                : waktuMepet
                  ? `Kurang dari ${DAYS_REMAINING_WARNING} hari`
                  : undefined
            }
            tone={waktuMepet ? "bad" : "default"}
          />
          <SnapshotFigure
            label="Nilai kontrak"
            value={formatCurrency(snapshot.contractValue)}
          />
          <SnapshotFigure
            label={sisaPagu >= 0 ? "Sisa pagu" : "Lewat pagu"}
            value={formatCurrency(Math.abs(sisaPagu))}
            tone={sisaPagu >= 0 ? "good" : "bad"}
            hint="Pagu dikurangi biaya disetujui dan komitmen"
          />
        </div>

        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {snapshot.healthReason}. Ini progres pekerjaan, bukan penyerapan biaya.
          </p>
        </div>

        {snapshot.pendingCost > 0 && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
            {formatCurrency(snapshot.pendingCost)} pengeluaran masih menunggu
            persetujuan dan belum masuk hitungan sisa pagu di atas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotFigure({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad" | "muted";
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
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
