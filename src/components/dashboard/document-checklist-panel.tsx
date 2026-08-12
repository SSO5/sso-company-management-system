"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChecklistUploadDialog } from "@/components/documents/checklist-upload-dialog";
import type { JobChecklist } from "@/server/document-checklist";
import { CheckCircle2, ChevronDown, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Progress is shown as "X dari Y dokumen wajib", never as a bare percentage.
 * A percentage invites a reflex to chase 100% for its own sake; naming the
 * count keeps attention on which specific document is outstanding, which is
 * the only thing anyone can actually act on.
 *
 * Optional slots are excluded from the bar entirely — counting them would make
 * a properly-documented job look permanently unfinished, and a progress bar
 * that never reaches full is one people stop reading.
 */

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-destructive")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function JobRow({ job, canUpload }: { job: JobChecklist; canUpload: boolean }) {
  const [open, setOpen] = useState(false);
  const missing = job.items.filter((i) => i.severity === "missing_required");
  const complete = missing.length === 0;

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{job.name}</span>
            <Badge variant="outline" className="shrink-0 text-[10px]">{job.stageLabel}</Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{job.customer} · {job.number}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <ProgressBar done={job.requiredDone} total={job.requiredTotal} />
            <span className={cn("shrink-0 text-[11px]", complete ? "text-success" : "text-muted-foreground")}>
              {job.requiredDone}/{job.requiredTotal}
            </span>
          </div>
        </div>
        {complete
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          : <Badge variant="destructive" className="shrink-0 text-[10px]">{missing.length} kurang</Badge>}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-1 border-t border-border px-3 py-2">
          {job.items.map((item) => (
            <div key={item.routeKey} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {item.count > 0
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  : <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", item.required ? "bg-destructive" : "bg-muted-foreground/40")} />}
                <span className={cn("truncate", item.count === 0 && item.required && "font-medium")}>{item.label}</span>
                {!item.required && item.count === 0 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">opsional</span>
                )}
              </span>
              {item.count > 0
                ? <span className="shrink-0 text-xs text-muted-foreground">{item.count} berkas</span>
                : item.folderId && canUpload
                  ? (
                    <ChecklistUploadDialog
                      items={job.items}
                      jobLabel={`${job.number} — ${job.name}`}
                      defaultRouteKey={item.routeKey}
                      trigger={
                        <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-xs">
                          <Upload className="h-3 w-3" /> Unggah
                        </Button>
                      }
                    />
                  )
                  : <span className="shrink-0 text-xs text-muted-foreground">—</span>}
            </div>
          ))}
          <div className="pt-1">
            <Link href={job.href} className="text-xs text-primary hover:underline">Buka pekerjaan ini →</Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentChecklistPanel({
  jobs,
  canUpload,
  limit = 5,
}: {
  jobs: JobChecklist[];
  canUpload: boolean;
  limit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const incomplete = jobs.filter((j) => j.requiredDone < j.requiredTotal);
  const shown = showAll ? jobs : incomplete.slice(0, limit);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Kelengkapan Dokumen</CardTitle>
        {incomplete.length > 0 && <Badge variant="outline">{incomplete.length} pekerjaan belum lengkap</Badge>}
      </CardHeader>
      <CardContent className="space-y-2">
        {jobs.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada pekerjaan aktif yang perlu dilengkapi.</p>
        )}
        {jobs.length > 0 && incomplete.length === 0 && !showAll && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Semua dokumen wajib sudah lengkap untuk {jobs.length} pekerjaan aktif.
          </div>
        )}
        {shown.map((job) => <JobRow key={`${job.kind}-${job.id}`} job={job} canUpload={canUpload} />)}
        {jobs.length > shown.length && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {showAll ? "Tampilkan yang belum lengkap saja" : `Tampilkan semua ${jobs.length} pekerjaan`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
