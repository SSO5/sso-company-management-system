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
import { cn, formatCurrency } from "@/lib/utils";
import type {
  CommandStage,
  CommandStep,
  CommandStepState,
  ProjectCommandData,
} from "@/lib/project-command";

/**
 * Project Command Center.
 *
 * Satu layar yang menjawab tiga pertanyaan yang selama ini tersebar di
 * banyak tab: proyek ini sedang di mana, apa yang menahannya, dan ke modul
 * mana harus pergi untuk menindaklanjutinya.
 *
 * Halaman ini tidak menghitung apa pun sendiri dan tidak mengubah status.
 * Semua angka datang jadi dari lapisan data, supaya layar ini tidak pernah
 * bisa berbeda dari laporan.
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
          <p className="text-[11px] text-muted-foreground">{step.detail}</p>
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
  const blocked = stage.steps.filter((s) => s.state === "BLOCKED").length;
  const done = stage.steps.filter((s) => s.state === "DONE").length;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{stage.title}</CardTitle>
          {blocked > 0 ? (
            <Badge variant="destructive">{blocked} tertahan</Badge>
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
          "text-lg font-semibold tabular-nums",
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

export function ProjectCommandCenter({ data }: { data: ProjectCommandData }) {
  const { snapshot, stages, quickLinks, attention } = data;
  const sisaPagu = snapshot.budget - snapshot.actualCost - snapshot.committedCost;

  return (
    <div className="space-y-4">
      {data.isMock && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Halaman ini masih memakai <strong>data tiruan</strong>. Angka dan nomor dokumen di
          bawah bukan data proyek yang sebenarnya — tampilannya dulu yang sedang diuji.
        </p>
      )}

      {/* Status & progres sekilas — ditaruh paling atas karena inilah yang
          ditanyakan lebih dulu sebelum orang tahu mau membuka modul mana. */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{data.projectName}</CardTitle>
            <Badge variant={snapshot.status === "ACTIVE" ? "default" : "secondary"}>
              {snapshot.statusLabel}
            </Badge>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            {snapshot.number}
            {snapshot.jobNumber ? ` · ${snapshot.jobNumber}` : ""} ·{" "}
            {snapshot.customerName} · PM: {snapshot.projectManager ?? "Belum ditunjuk"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <SnapshotFigure
              label="Progres pekerjaan"
              value={`${snapshot.progressPercent}%`}
              hint={`${snapshot.milestonesDone} dari ${snapshot.milestonesTotal} milestone`}
            />
            <SnapshotFigure
              label="Sisa waktu"
              value={
                snapshot.daysRemaining === null
                  ? "—"
                  : `${snapshot.daysRemaining} hari`
              }
              hint={snapshot.daysRemaining === null ? "Tanggal selesai belum diisi" : undefined}
              tone={
                snapshot.daysRemaining !== null && snapshot.daysRemaining < 14
                  ? "bad"
                  : "default"
              }
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

          {/* Batang progres pekerjaan, bukan progres biaya — dua hal yang
              sering tertukar. Perbandingan biaya ada di papan biaya. */}
          <div className="space-y-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, snapshot.progressPercent))}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Progres pekerjaan dari milestone, bukan penyerapan biaya.
            </p>
          </div>
        </CardContent>
      </Card>

      {attention.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <TriangleAlert className="h-4 w-4" /> Yang menahan proyek ini
          </p>
          <ul className="ml-5 list-disc space-y-0.5 text-xs text-muted-foreground">
            {attention.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Ikhtisar alur proyek: Komersial → Pengadaan → Pelaksanaan → Kendali,
          urutan yang sama dengan jalannya pekerjaan yang sebenarnya. */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => (
          <StageCard key={stage.key} stage={stage} />
        ))}
      </div>

      {/* Tautan cepat modul — semuanya menuju modul yang sudah ada, tidak
          ada layar baru yang perlu dipelajari ulang. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Buka modul</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Semua tautan menuju modul yang sudah dipakai selama ini, disaring untuk
            proyek ini.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {quickLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted"
            >
              <p className="text-sm font-medium">{link.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {link.count !== undefined ? `${link.count} dokumen` : "Buka"}
                {link.hint ? ` · ${link.hint}` : ""}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
