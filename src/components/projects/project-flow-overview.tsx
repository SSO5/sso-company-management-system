import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDashed,
  Loader,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  stageProgress,
  stageState,
  type CommandStage,
  type CommandStep,
  type CommandStepState,
  type StageState,
} from "@/lib/project-command";

/**
 * Ikhtisar Alur Proyek — Komersial → Pengadaan → Pelaksanaan → Kendali.
 *
 * Dua lapis, dan itu disengaja:
 *
 *   1. REL TAHAP  — empat tahap berjajar dengan panah di antaranya, supaya
 *      "proyek ini sedang di mana" terjawab dalam satu pandangan, tanpa
 *      membaca satu angka pun.
 *   2. RINCIAN    — langkah per tahap, masing-masing menuju modul yang sudah
 *      ada. Baris inilah yang menjawab "lalu saya harus ke mana".
 *
 * Komponen ini tidak menghitung dan tidak mengubah status apa pun. Keadaan
 * tiap tahap disimpulkan oleh stageState() yang murni dan diuji terpisah,
 * bukan oleh cabang if di dalam JSX.
 */

const stepIcon: Record<CommandStepState, typeof Check> = {
  DONE: Check,
  ACTIVE: Loader,
  BLOCKED: TriangleAlert,
  TODO: CircleDashed,
};

const stepTone: Record<CommandStepState, string> = {
  DONE: "text-success",
  ACTIVE: "text-primary",
  BLOCKED: "text-destructive",
  TODO: "text-muted-foreground",
};

const stageLabel: Record<StageState, string> = {
  DONE: "Selesai",
  ACTIVE: "Berjalan",
  BLOCKED: "Tertahan",
  TODO: "Belum mulai",
};

const stageRailTone: Record<StageState, string> = {
  DONE: "border-success/40 bg-success/10",
  ACTIVE: "border-primary/40 bg-primary/10",
  BLOCKED: "border-destructive/40 bg-destructive/10",
  TODO: "border-border bg-muted/40",
};

function StepRow({ step }: { step: CommandStep }) {
  const Icon = stepIcon[step.state];
  const body = (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors",
        step.href && "hover:bg-muted",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", stepTone[step.state])} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm",
            step.state === "TODO" && "text-muted-foreground",
            step.state === "BLOCKED" && "font-medium",
          )}
        >
          {step.label}
        </p>
        {step.detail && (
          <p className="break-words text-[11px] text-muted-foreground">{step.detail}</p>
        )}
      </div>
      {step.href && (
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
    </div>
  );

  return step.href ? (
    <Link href={step.href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function StageCard({ stage }: { stage: CommandStage }) {
  const state = stageState(stage);
  const done = stage.steps.filter((s) => s.state === "DONE").length;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{stage.title}</CardTitle>
          {state === "BLOCKED" ? (
            <Badge variant="destructive">Tertahan</Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {done}/{stage.steps.length} selesai
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">{stage.caption}</p>
      </CardHeader>
      <CardContent className="flex-1 space-y-0.5 pt-0">
        {stage.steps.map((step, i) => (
          <StepRow key={i} step={step} />
        ))}
      </CardContent>
    </Card>
  );
}

function StageRail({ stages }: { stages: CommandStage[] }) {
  return (
    /* Di ponsel empat tahap berjajar akan menyisakan ~70px per tahap dan
       judulnya terpotong. Jadi: 2x2 di layar kecil, satu baris dengan panah
       penghubung mulai md. Panahnya sendiri disembunyikan di layar kecil
       karena urutan baca dari kiri-atas ke kanan-bawah sudah jelas. */
    <div className="grid grid-cols-2 gap-1.5 md:flex md:items-stretch">
      {stages.map((stage, i) => {
        const state = stageState(stage);
        const percent = stageProgress(stage);
        return (
          <div
            key={stage.key}
            className="flex min-w-0 items-center gap-1.5 md:flex-1"
          >
            <div
              className={cn(
                "min-w-0 flex-1 rounded-lg border px-2.5 py-2 sm:px-3",
                stageRailTone[state],
              )}
            >
              <p className="truncate text-xs font-medium">{stage.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {stageLabel[state]} · {percent}%
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-background/60">
                <div
                  className={cn(
                    "h-full",
                    state === "BLOCKED" ? "bg-destructive" : "bg-primary",
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
            {i < stages.length - 1 && (
              <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProjectFlowOverview({ stages }: { stages: CommandStage[] }) {
  if (stages.length === 0) return null;

  return (
    <div className="space-y-3">
      <StageRail stages={stages} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => (
          <StageCard key={stage.key} stage={stage} />
        ))}
      </div>
    </div>
  );
}
