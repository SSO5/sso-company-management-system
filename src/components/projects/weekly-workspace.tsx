"use client";
import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ReportItemEditor } from "./report-item-editor";
import { useDocumentPreview } from "@/components/documents/document-preview";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import {
  compareWeeklyItems,
  CHANGE_LABELS,
  type WeeklyChange,
} from "@/lib/weekly-comparison";
import {
  getWeeklyProject,
  requestReportReview,
  decideReportReview,
  recordReportDispatch,
  saveWeeklySettings,
  classifyProgressDocument,
  updateWeeklyReportDetails,
} from "@/server/projects/weekly";
import { uploadDocumentToFolder } from "@/server/documents/documents";
import { generateProgressReportFromDocument } from "@/server/projects/progress-reports";
import { createTask } from "@/server/projects/tasks";
import {
  ArrowRight,
  Upload,
  History,
  FileCheck2,
  Sparkles,
  Eye,
  Check,
  Clock3,
  Send,
  UserRound,
  CalendarDays,
} from "lucide-react";

export type WeeklyData = Awaited<ReturnType<typeof getWeeklyProject>>;
export interface WeeklyDocument {
  id: string;
  originalName: string;
  mimeType?: string;
  progressFormat?: string;
  uploadedAt?: Date;
  processingState?: string;
  processingError?: string | null;
}
const reviewLabels: Record<string, string> = {
  SUPERSEDED: "Digantikan versi terbaru",
  PENDING: "Menunggu direktur",
  APPROVED: "Disetujui",
  REJECTED: "Perlu revisi",
};
const notificationLabels: Record<string, string> = {
  PROVIDER_ACCEPTED:
    "Permintaan WA diterima penyedia; penerimaan belum terkonfirmasi.",
  FAILED: "Notifikasi WA gagal. Permintaan tetap tersedia di aplikasi.",
  NOT_CONFIGURED: "WhatsApp belum siap. Persetujuan tersedia di aplikasi.",
  NOT_SENT: "Notifikasi belum dikirim.",
};
const day = (value: Date) => new Date(value).toISOString().slice(0, 10);
const dateInput = (value?: Date | null) => (value ? day(value) : "");

export function WeeklyWorkspace({
  projectId,
  folderId,
  data,
  documents,
  assignees,
  role,
  historyOnly = false,
}: {
  projectId: string;
  folderId: string | null;
  data: WeeklyData;
  documents: WeeklyDocument[];
  assignees: { id: string; name: string }[];
  role: UserRole;
  historyOnly?: boolean;
}) {
  const router = useRouter(),
    params = useSearchParams(),
    { toast } = useToast();
  const previewDocument = useDocumentPreview();
  const requestedReview = params.get("review"),
    requestedReport = params.get("report");
  const linked = data.reports.find(
    (r) =>
      r.id === requestedReport ||
      r.reviews.some((v) => v.id === requestedReview),
  );
  const latestDate = data.reports[0] && day(data.reports[0].inspectionDate);
  const candidates = data.reports.filter(
    (r) => day(r.inspectionDate) === latestDate,
  );
  const [selectedId, setSelectedId] = useState(
    linked?.id ?? candidates[0]?.id ?? data.reports[0]?.id ?? "",
  );
  const selected = data.reports.find((r) => r.id === selectedId);
  const prior = data.reports.filter(
    (r) =>
      selected &&
      +new Date(r.inspectionDate) < +new Date(selected.inspectionDate),
  );
  const priorDate = prior[0] && day(prior[0].inspectionDate);
  const previousCandidates = prior.filter(
    (r) => day(r.inspectionDate) === priorDate,
  );
  const [previousChoice, setPreviousChoice] = useState<string | null>(null);
  const previousId =
    previousChoice ??
    previousCandidates[0]?.id ?? "";
  const previous = data.reports.find((r) => r.id === previousId);
  const comparisons = useMemo(
    () =>
      previous && selected
        ? compareWeeklyItems(previous.items, selected.items)
        : [],
    [previous, selected],
  );
  const [filter, setFilter] = useState("action");
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState<
    "upload" | "settings" | "send" | "reject" | "followup" | "details" | null
  >(null);
  const [finding, setFinding] = useState<WeeklyChange | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const canWrite = ["ADMIN", "PROJECT_MANAGER", "SALES"].includes(role);
  const canAssign = ["ADMIN", "PROJECT_MANAGER"].includes(role);
  const review =
    selected?.reviews.find((v) => v.id === requestedReview) ??
    selected?.reviews[0];
  const pending = Boolean(busy);
  const owner = assignees.find((a) => a.id === data.settings?.ownerId)?.name;
  const actionFindings = comparisons.filter((item) => item.kind !== "unchanged");
  const clearChanges = comparisons.filter((item) =>
    ["changed", "new"].includes(item.kind),
  ).length;
  const needsClarification = comparisons.filter((item) =>
    ["ambiguous", "missing"].includes(item.kind),
  ).length;
  const unchanged = comparisons.filter((item) => item.kind === "unchanged").length;
  const approved = Boolean(
    review?.status === "APPROVED" && review.isCurrent,
  );
  const dispatched = Boolean(review?.dispatch && review.isCurrent);
  const workflowSteps = [
    { label: "Laporan masuk", done: Boolean(selected), icon: Upload },
    { label: "Draf SSO", done: Boolean(selected), icon: FileCheck2 },
    { label: "Persetujuan", done: approved || dispatched, icon: Check },
    { label: "Terkirim", done: dispatched, icon: Send },
  ];
  async function action(
    label: string,
    job: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusy(label);
    try {
      const result = await job();
      if (!result.ok) throw new Error(result.error || "Tidak dapat menyimpan.");
      setModal(null);
      router.refresh();
      toast({ title: label, variant: "success" });
    } catch (error) {
      toast({
        title: "Belum berhasil",
        description: error instanceof Error ? error.message : "Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  }
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!folderId) return;
    const fd = new FormData(e.currentTarget);
    const incoming = fd.get("file");
    const canPrepareDraft =
      uploadId ||
      (incoming instanceof File &&
        (incoming.type === "application/pdf" || incoming.type.startsWith("image/")));
    setBusy("Mengunggah dokumen…");
    try {
      let id = uploadId;
      if (!id) {
        const result = await uploadDocumentToFolder(folderId, fd);
        if (!result.ok) throw new Error(result.error);
        id = result.data.id;
        setUploadId(id);
        const classified = await classifyProgressDocument(
          id,
          fd.get("format") === "SSO" ? "SSO" : "VENDOR",
        );
        if (!classified.ok) throw new Error(classified.error);
      }
      if (!canPrepareDraft) {
        setUploadId(null);
        setModal(null);
        router.refresh();
        toast({
          title: "File laporan tersimpan",
          description:
            "File dapat dibuka di panel samping. Pembuatan draf otomatis saat ini tersedia untuk PDF dan gambar.",
          variant: "success",
        });
        return;
      }
      setBusy("Membaca dokumen dan menyiapkan draf SSO…");
      const result = await generateProgressReportFromDocument(id, projectId);
      if (!result.ok) throw new Error(result.error);
      setSelectedId(result.data.progressReportId);
      setPreviousChoice(null);
      setUploadId(null);
      setModal(null);
      router.refresh();
      toast({
        title: "Draf SSO siap diperiksa",
        description:
          "Cocokkan tanggal, rincian dan foto dengan dokumen asli sebelum diajukan.",
        variant: "success",
      });
    } catch (error) {
      router.refresh();
      toast({
        title: "File yang berhasil diunggah tetap tersimpan",
        description:
          error instanceof Error
            ? error.message
            : "Gunakan Coba lagi pada dokumen.",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  }
  const sourceList = (
    <div className="space-y-3">
      {documents.map((d) => {
        const canGenerate =
          d.mimeType === "application/pdf" ||
          Boolean(d.mimeType?.startsWith("image/")) ||
          /\.(pdf|jpe?g|png|webp)$/i.test(d.originalName);
        return (
        <div
          key={d.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
        >
          <div className="min-w-0">
            <span
              className={`text-xs font-semibold ${d.progressFormat === "SSO" ? "text-emerald-700" : "text-slate-600"}`}
            >
              {d.progressFormat === "VENDOR"
                ? "VENDOR · file asli"
                : d.progressFormat === "SSO"
                  ? "SSO · file unggahan"
                  : "FORMAT BELUM DITETAPKAN"}
            </span>
            <p className="break-words text-sm font-medium">{d.originalName}</p>
            <p className="text-xs text-muted-foreground">
              {d.uploadedAt
                ? `Masuk ${formatDate(d.uploadedAt)}`
                : "Waktu masuk tersedia pada dokumen"}
            </p>
            {d.processingState === "FAILED" && (
              <p className="text-xs text-amber-700">{d.processingError}</p>
            )}
            {d.processingState === "PROCESSING" && (
              <p className="text-xs text-amber-700">
                Pemrosesan belum selesai. Jika terputus, coba lagi setelah 10
                menit.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                previewDocument({
                  title: d.originalName,
                  url: `/api/files/${d.id}?view=1`,
                })
              }
            >
              <Eye size={15} /> Lihat di samping
            </Button>
            {canWrite && (
              <>
                <Select
                  aria-label={`Format ${d.originalName}`}
                  className="w-44"
                  value={d.progressFormat ?? "UNKNOWN"}
                  disabled={pending}
                  onChange={(e) =>
                    action("Format sumber disimpan", () =>
                      classifyProgressDocument(
                        d.id,
                        e.target.value as "VENDOR" | "SSO",
                      ),
                    )
                  }
                >
                  <option value="UNKNOWN" disabled>
                    Pilih format
                  </option>
                  <option value="VENDOR">Vendor</option>
                  <option value="SSO">SSO</option>
                </Select>
                {canGenerate && (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      action("Draf siap", async () => {
                        const result = await generateProgressReportFromDocument(d.id, projectId);
                        if (result.ok) {
                          setSelectedId(result.data.progressReportId);
                          setPreviousChoice(null);
                        }
                        return result;
                      })
                    }
                  >
                    {d.processingState === "FAILED"
                      ? "Coba proses lagi"
                      : "Buat draf SSO"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        );
      })}
      {!documents.length && (
        <p className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
          Belum ada sumber laporan. Unggah dokumen pertama untuk mulai membangun
          riwayat.
        </p>
      )}
    </div>
  );
  return (
    <div className="space-y-5">
      {historyOnly ? (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Arsip proyek
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Dokumen dan jejak pengiriman
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pilih dokumen untuk membukanya di panel kanan tanpa meninggalkan proyek.
            </p>
          </div>
          {sourceList}
          <div className="space-y-3">
            {data.reports.map((r) => (
              <details key={r.id} className="rounded-xl border bg-white p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  SSO · {r.number} · {formatDate(r.inspectionDate)}
                </summary>
                <div className="mt-3 space-y-3">
                  <Button
                    variant="outline"
                    onClick={() =>
                      previewDocument({
                        title: r.number,
                        url: `/api/progress-reports/${r.id}/pdf?view=1`,
                      })
                    }
                  >
                    <Eye size={15} /> Lihat di samping
                  </Button>
                  {!r.reviews.length && (
                    <p className="text-xs text-muted-foreground">
                      Belum ada persetujuan atau catatan pengiriman.
                    </p>
                  )}
                  {r.reviews.map((v) => (
                    <div key={v.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                      <b>Versi {v.version} · {reviewLabels[v.status]}</b>
                      <p className="text-xs text-muted-foreground">
                        Diajukan {formatDate(v.requestedAt)}
                        {v.decidedAt ? ` · Diputuskan ${formatDate(v.decidedAt)}` : ""}
                      </p>
                      {v.decisionNote && <p className="mt-2">{v.decisionNote}</p>}
                      {v.dispatch && (
                        <p className="mt-2">
                          {v.dispatch.channel} → {v.dispatch.recipient} · {formatDate(v.dispatch.sentAt)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Siklus laporan mingguan
                </p>
                <label className="mt-2 block max-w-2xl text-sm font-medium">
                  Laporan yang dipantau
                  <Select
                    className="mt-2"
                    aria-label="Laporan yang dipantau"
                    value={selectedId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedId(nextId);
                      setPreviousChoice(null);
                      const report = data.reports.find((item) => item.id === nextId);
                      if (report)
                        previewDocument({
                          title: report.number,
                          url: `/api/progress-reports/${report.id}/pdf?view=1`,
                        });
                    }}
                  >
                    <option value="">Belum ada laporan</option>
                    {data.reports.map((r) => (
                      <option key={r.id} value={r.id}>
                        {formatDate(r.inspectionDate)} · {r.number}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              {canWrite && folderId && (
                <Button
                  disabled={pending}
                  onClick={() => {
                    setUploadId(null);
                    setModal("upload");
                  }}
                >
                  <Upload size={16} /> Unggah laporan baru
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 border-b sm:grid-cols-4">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                const active = !step.done && workflowSteps.slice(0, index).every((item) => item.done);
                return (
                  <div
                    key={step.label}
                    className={`flex min-h-20 items-center gap-3 border-r p-3 last:border-r-0 ${step.done ? "bg-emerald-50/70 text-emerald-900" : active ? "bg-amber-50 text-amber-950" : "text-muted-foreground"}`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${step.done ? "bg-emerald-700 text-white" : active ? "bg-amber-400 text-amber-950" : "bg-slate-100"}`}>
                      {step.done ? <Check size={16} /> : <Icon size={15} />}
                    </span>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide">Tahap {index + 1}</p>
                      <p className="text-sm font-semibold">{step.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 text-sm sm:p-5">
              <span className="inline-flex items-center gap-2">
                <UserRound size={15} className="text-primary" />
                <span className="text-muted-foreground">PIC</span>
                <b>{owner || "Belum ditetapkan"}</b>
              </span>
              <span className="inline-flex items-center gap-2">
                <CalendarDays size={15} className="text-primary" />
                <span className="text-muted-foreground">Vendor</span>
                <b>{data.settings?.vendorDueAt ? formatDate(data.settings.vendorDueAt) : "Belum diatur"}</b>
              </span>
              <span className="inline-flex items-center gap-2">
                <Send size={15} className="text-primary" />
                <span className="text-muted-foreground">Pelanggan</span>
                <b>{data.settings?.customerDueAt ? formatDate(data.settings.customerDueAt) : "Belum diatur"}</b>
              </span>
              {canAssign && (
                <Button variant="ghost" className="ml-auto" onClick={() => setModal("settings")}>
                  Atur PIC & tanggal
                </Button>
              )}
            </div>
          </section>

          {!selected ? (
            <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
              <h3 className="font-semibold">Belum ada laporan untuk dipantau</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Unggah file vendor untuk menyimpan bukti dan menyiapkan draf SSO.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0 space-y-5 rounded-2xl border bg-white p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                      Perubahan terbaru
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">
                      {previous
                        ? `${formatDate(previous.inspectionDate)} → ${formatDate(selected.inspectionDate)}`
                        : formatDate(selected.inspectionDate)}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {previous
                        ? `${previous.number} dibandingkan dengan ${selected.number}`
                        : `${selected.number} menjadi awal riwayat proyek.`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.source && !selected.source.deletedAt && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          previewDocument({
                            title: selected.source!.originalName,
                            url: `/api/files/${selected.source!.id}?view=1`,
                          })
                        }
                      >
                        <Eye size={15} /> {selected.source.progressFormat === "VENDOR" ? "Vendor asli" : "Sumber unggahan"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() =>
                        previewDocument({
                          title: `Draf SSO · ${selected.number}`,
                          url: `/api/progress-reports/${selected.id}/pdf?view=1`,
                        })
                      }
                    >
                      <Eye size={15} /> Draf SSO
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl bg-emerald-50/70 p-4">
                  <p className="text-sm leading-relaxed">
                    {selected.summary || "Ringkasan belum tersedia. Periksa isi draf dan dokumen sumber."}
                  </p>
                  {!selected.dateVerified && (
                    <button
                      className="mt-3 text-xs font-semibold text-amber-800 underline"
                      onClick={() => setModal("details")}
                    >
                      Tanggal perlu diperiksa
                    </button>
                  )}
                </div>

                {previous ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => setFilter("action")} className={`rounded-xl border p-3 text-left ${filter === "action" ? "border-primary bg-primary/5" : ""}`}>
                        <span className="block text-2xl font-semibold">{actionFindings.length}</span>
                        <span className="text-xs text-muted-foreground">Perlu dilihat</span>
                      </button>
                      <button onClick={() => setFilter("changed")} className={`rounded-xl border p-3 text-left ${filter === "changed" ? "border-primary bg-primary/5" : ""}`}>
                        <span className="block text-2xl font-semibold">{clearChanges}</span>
                        <span className="text-xs text-muted-foreground">Ada perubahan</span>
                      </button>
                      <button onClick={() => setFilter("ambiguous")} className={`rounded-xl border p-3 text-left ${filter === "ambiguous" ? "border-primary bg-primary/5" : ""}`}>
                        <span className="block text-2xl font-semibold">{needsClarification}</span>
                        <span className="text-xs text-muted-foreground">Perlu klarifikasi</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setFilter("action")} className={`min-h-10 rounded-full border px-3 text-xs ${filter === "action" ? "bg-primary text-white" : ""}`}>Prioritas</button>
                      <button onClick={() => setFilter("all")} className={`min-h-10 rounded-full border px-3 text-xs ${filter === "all" ? "bg-primary text-white" : ""}`}>Semua ({comparisons.length})</button>
                      <button onClick={() => setFilter("unchanged")} className={`min-h-10 rounded-full border px-3 text-xs ${filter === "unchanged" ? "bg-primary text-white" : ""}`}>Tetap ({unchanged})</button>
                      <details className="ml-auto text-xs">
                        <summary className="cursor-pointer py-2 text-primary">Ganti pembanding</summary>
                        <Select
                          className="mt-2 min-w-64"
                          aria-label="Ganti laporan pembanding"
                          value={previousId}
                          onChange={(e) => setPreviousChoice(e.target.value)}
                        >
                          {prior.map((r) => (
                            <option key={r.id} value={r.id}>
                              {formatDate(r.inspectionDate)} · {r.number}
                            </option>
                          ))}
                        </Select>
                      </details>
                    </div>

                    <div className="space-y-3">
                      {comparisons
                        .filter((item) =>
                          filter === "all"
                            ? true
                            : filter === "action"
                              ? item.kind !== "unchanged"
                              : filter === "ambiguous"
                                ? ["ambiguous", "missing"].includes(item.kind)
                                : item.kind === filter,
                        )
                        .map((item) => (
                          <article key={item.key} className="rounded-xl border p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-primary">
                                  {(item.after ?? item.before)?.sectionName || "Unit perlu dipastikan"} · {CHANGE_LABELS[item.kind]}
                                </p>
                                <h3 className="mt-1 text-sm font-semibold">
                                  {(item.after ?? item.before)?.partName}{" "}
                                  <span className="font-normal text-muted-foreground">{(item.after ?? item.before)?.quantity}</span>
                                </h3>
                              </div>
                              {canAssign && item.kind !== "unchanged" && (
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setFinding(item);
                                    setModal("followup");
                                  }}
                                >
                                  Tindak lanjuti <ArrowRight size={14} />
                                </Button>
                              )}
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                                <p className="mb-1 text-xs text-muted-foreground">Sebelumnya</p>
                                {item.before?.notes || (item.before ? "Tanpa keterangan" : "Belum tercantum")}
                              </div>
                              <div className="rounded-lg bg-emerald-50/70 p-3 text-sm">
                                <p className="mb-1 text-xs text-muted-foreground">Terbaru</p>
                                {item.after?.notes || (item.after ? "Tanpa keterangan" : "Tidak tercantum lagi")}
                              </div>
                            </div>
                          </article>
                        ))}
                      {!comparisons.some((item) =>
                        filter === "all"
                          ? true
                          : filter === "action"
                            ? item.kind !== "unchanged"
                            : filter === "ambiguous"
                              ? ["ambiguous", "missing"].includes(item.kind)
                              : item.kind === filter,
                      ) && (
                        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                          Tidak ada item pada kelompok ini.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                    Ini laporan pertama. Perbandingan akan muncul setelah laporan berikutnya masuk.
                  </p>
                )}
              </section>

              <aside className="space-y-4">
                <section className="rounded-2xl border bg-white p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                      {dispatched ? <Check size={19} /> : <Clock3 size={19} />}
                    </span>
                    <div>
                      <p className="text-xs text-muted-foreground">Tindakan berikutnya</p>
                      <h3 className="font-semibold">
                        {dispatched
                          ? "Siklus selesai"
                          : approved
                            ? "Catat pengiriman"
                            : review?.status === "PENDING" && review.isCurrent
                              ? "Menunggu direktur"
                              : review?.status === "REJECTED" && review.isCurrent
                                ? "Perbaiki draf"
                                : "Periksa lalu ajukan"}
                      </h3>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <Button variant="outline" className="w-full" onClick={() => setModal("details")}>
                      Periksa isi draf
                    </Button>
                    {review && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          previewDocument({
                            title: `Salinan persetujuan · versi ${review.version}`,
                            url: `/api/report-reviews/${review.id}/pdf?view=1`,
                          })
                        }
                      >
                        <Eye size={15} /> Lihat versi {review.version}
                      </Button>
                    )}

                    {canWrite && !approved && !(review?.status === "PENDING" && review.isCurrent) && (
                      <Button
                        className="w-full"
                        disabled={pending || !data.approverName || !selected.dateVerified}
                        onClick={() =>
                          action("Permintaan persetujuan tersimpan", () => requestReportReview(selected.id))
                        }
                      >
                        Ajukan ke direktur
                      </Button>
                    )}

                    {review?.status === "PENDING" && review.isCurrent && (
                      <p className="rounded-xl bg-amber-50 p-3 text-sm">
                        Menunggu keputusan {data.approverName || "direktur"}.
                      </p>
                    )}

                    {data.isApprover && review?.status === "PENDING" && review.isCurrent && (
                      <div className="grid gap-2">
                        <Button
                          disabled={pending}
                          onClick={() => action("Laporan disetujui", () => decideReportReview(review.id, "APPROVED", ""))}
                        >
                          Setujui versi {review.version}
                        </Button>
                        <Button disabled={pending} variant="outline" onClick={() => setModal("reject")}>
                          Minta revisi
                        </Button>
                      </div>
                    )}

                    {review?.status === "REJECTED" && review.isCurrent && review.decisionNote && (
                      <p className="rounded-xl bg-amber-50 p-3 text-sm">{review.decisionNote}</p>
                    )}

                    {approved && !review?.dispatch && canWrite && (
                      <Button className="w-full" onClick={() => setModal("send")}>
                        Tandai sudah dikirim
                      </Button>
                    )}

                    {review?.dispatch && review.isCurrent && (
                      <div className="rounded-xl bg-emerald-50 p-3 text-sm">
                        <b>Terkirim via {review.dispatch.channel}</b>
                        <p>{review.dispatch.recipient}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {review.dispatch.recordedByName} · {formatDate(review.dispatch.sentAt)}
                        </p>
                      </div>
                    )}

                    {review && (
                      <p className="text-xs text-muted-foreground">
                        {notificationLabels[review.notificationStatus]}
                      </p>
                    )}
                  </div>
                </section>
              </aside>
            </div>
          )}

          <details className="rounded-xl border bg-white p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <History size={16} /> File sumber & riwayat ({documents.length})
            </summary>
            <div className="mt-4">{sourceList}</div>
          </details>

          <details className="rounded-xl border bg-slate-50 p-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-foreground">Cara aplikasi membaca progres</summary>
            <p className="mt-3 leading-relaxed">
              Perbandingan mengikuti isi laporan. Item yang tidak muncul lagi ditandai untuk klarifikasi, bukan dianggap selesai. Status pembayaran tidak dipakai sebagai ukuran progres fisik.
            </p>
          </details>
        </>
      )}
      <Dialog
        open={modal === "upload"}
        onOpenChange={(open) => !open && !pending && setModal(null)}
        title="Unggah laporan"
        description="File langsung tersimpan dan dapat dilihat di panel samping. PDF atau gambar juga diproses menjadi draf SSO."
      >
        <form onSubmit={upload} className="space-y-4">
          <label className="block text-sm">
            Format dokumen
            <Select
              name="format"
              defaultValue="VENDOR"
              disabled={pending || Boolean(uploadId)}
            >
              <option value="VENDOR">Laporan vendor</option>
              <option value="SSO">Sudah berformat SSO</option>
            </Select>
          </label>
          <label className="block text-sm">
            File laporan
            <Input
              name="file"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp,.zip,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm"
              required={!uploadId}
              disabled={pending || Boolean(uploadId)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Akun dan waktu masuk dicatat otomatis. PDF serta gambar dapat
            dibuat menjadi draf SSO; format lain tetap tersimpan dan bisa
            dibuka dari ruang proyek ini.
          </p>
          <Button type="submit" disabled={pending}>
            <Sparkles size={16} />
            {busy ||
              (uploadId
                ? "Coba lagi dari file tersimpan"
                : "Unggah & siapkan draf")}
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={modal === "settings"}
        onOpenChange={(open) => !open && setModal(null)}
        title="PIC dan target laporan"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            action("PIC dan jadwal disimpan", () =>
              saveWeeklySettings(projectId, {
                ownerId: fd.get("owner") || null,
                vendorDueAt: fd.get("vendor")
                  ? `${fd.get("vendor")}T10:00:00+07:00`
                  : null,
                customerDueAt: fd.get("customer")
                  ? `${fd.get("customer")}T17:00:00+07:00`
                  : null,
              }),
            );
          }}
        >
          <label className="block text-sm">
            PIC siklus
            <Select name="owner" defaultValue={data.settings?.ownerId ?? ""}>
              <option value="">Belum ditetapkan</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            Terima dari vendor
            <Input
              type="date"
              name="vendor"
              defaultValue={dateInput(data.settings?.vendorDueAt)}
            />
          </label>
          <label className="block text-sm">
            Kirim ke customer
            <Input
              type="date"
              name="customer"
              defaultValue={dateInput(data.settings?.customerDueAt)}
            />
          </label>
          <Button disabled={pending}>Simpan</Button>
        </form>
      </Dialog>
      <Dialog
        open={modal === "send"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Konfirmasi sudah dikirim"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!review) return;
            const fd = new FormData(e.currentTarget);
            action("Pengiriman dicatat", () =>
              recordReportDispatch({
                reviewId: review.id,
                recipient: fd.get("recipient"),
                channel: fd.get("channel"),
                ...(fd.get("sentAt")
                  ? { sentAt: new Date(String(fd.get("sentAt"))).toISOString() }
                  : {}),
                note: fd.get("note") || undefined,
              }),
            );
          }}
        >
          <p className="text-sm">
            Saya sudah mengirim salinan versi {review?.version} yang disetujui.
            Akun saya dan waktu sekarang dicatat otomatis.
          </p>
          <label className="block text-sm">
            Penerima
            <Input
              name="recipient"
              required
              defaultValue={data.settings?.recipient ?? ""}
              placeholder="PIC atau grup customer"
            />
          </label>
          <label className="block text-sm">
            Kanal
            <Select
              name="channel"
              defaultValue={data.settings?.channel ?? "WhatsApp"}
            >
              <option>WhatsApp</option>
              <option>Email</option>
            </Select>
          </label>
          <details>
            <summary className="cursor-pointer py-2 text-sm">
              Kirim sebelumnya / tambah keterangan
            </summary>
            <label className="block text-sm">
              Waktu kirim sebenarnya
              <Input name="sentAt" type="datetime-local" />
            </label>
            <Textarea name="note" placeholder="Referensi bukti (opsional)" />
          </details>
          <p className="text-xs text-muted-foreground">
            Tombol ini mencatat pengiriman yang sudah Anda lakukan, bukan
            mengirim pesan.
          </p>
          <Button disabled={pending}>Ya, sudah dikirim</Button>
        </form>
      </Dialog>
      <Dialog
        open={modal === "reject"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Minta perbaikan laporan"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!review) return;
            const fd = new FormData(e.currentTarget);
            action("Permintaan revisi dicatat", () =>
              decideReportReview(review.id, "REJECTED", String(fd.get("note"))),
            );
          }}
        >
          <Textarea
            name="note"
            aria-label="Bagian yang perlu direvisi"
            required
            placeholder="Bagian mana yang perlu diperbaiki?"
          />
          <Button disabled={pending}>Kirim catatan revisi</Button>
        </form>
      </Dialog>
      <Dialog
        open={modal === "followup"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Tindak lanjut dari laporan"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            action("Tindak lanjut ditugaskan", () =>
              createTask({
                projectId,
                title: fd.get("title"),
                description: `Sumber ${selected?.number}; ${finding?.after?.sectionName ?? finding?.before?.sectionName ?? ""}. Sebelumnya: ${finding?.before?.notes ?? "Tidak tersedia"}. Laporan dipilih: ${finding?.after?.notes ?? "Tidak tersedia"}.`,
                assignedToId: fd.get("owner"),
                dueDate: fd.get("due")
                  ? `${fd.get("due")}T17:00:00+07:00`
                  : null,
                priority: "HIGH",
              }),
            );
          }}
        >
          <label className="block text-sm">
            Apa yang perlu ditindaklanjuti?
            <Input
              name="title"
              required
              defaultValue={`Konfirmasi ${(finding?.after ?? finding?.before)?.partName ?? "progres"}`}
            />
          </label>
          <label className="block text-sm">
            Penanggung jawab
            <Select
              name="owner"
              required
              defaultValue={data.settings?.ownerId ?? ""}
            >
              <option value="" disabled>
                Pilih PIC
              </option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            Target selesai
            <Input name="due" type="date" required />
          </label>
          <p className="text-xs text-muted-foreground">
            Temuan sumber ikut dicatat. PIC mendapat pemberitahuan aplikasi dan
            permintaan notifikasi WhatsApp jika kanal tersedia.
          </p>
          <Button disabled={pending}>Tetapkan tindak lanjut</Button>
        </form>
      </Dialog>

      <Dialog
        open={modal === "details"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Periksa draf SSO"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected) return;
            const fd = new FormData(e.currentTarget);
            action("Draf diperiksa", () =>
              updateWeeklyReportDetails(selected.id, {
                inspectionDate: `${fd.get("date")}T12:00:00+07:00`,
                summary: String(fd.get("summary") || "") || null,
              }),
            );
          }}
        >
          <p className="text-sm">
            Cocokkan tanggal dan ringkasan dengan sumber. Koreksi ini tidak
            mengubah file asli; versi yang sudah diajukan tetap tersimpan.
          </p>
          <label className="block text-sm">
            Tanggal dalam laporan
            <Input
              name="date"
              type="date"
              required
              defaultValue={selected ? dateInput(selected.inspectionDate) : ""}
            />
          </label>
          <label className="block text-sm">
            Ringkasan sesuai bukti
            <Textarea
              name="summary"
              rows={5}
              defaultValue={selected?.summary ?? ""}
            />
          </label>
            <Button disabled={pending}>Simpan hasil pemeriksaan</Button>
          </form>
          {selected && <ReportItemEditor projectId={projectId} items={selected.items} />}
      </Dialog>
      {busy && (
        <p
          role="status"
          className="sticky bottom-4 rounded-xl bg-primary p-3 text-sm text-white shadow-lg"
        >
          {busy}
        </p>
      )}
    </div>
  );
}
