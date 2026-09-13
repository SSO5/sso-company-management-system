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
  AlertCircle,
  Sparkles,
} from "lucide-react";

export type WeeklyData = Awaited<ReturnType<typeof getWeeklyProject>>;
export interface WeeklyDocument {
  id: string;
  originalName: string;
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
    linked?.id ?? (candidates.length === 1 ? candidates[0].id : ""),
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
    (previousCandidates.length === 1 ? previousCandidates[0].id : "");
  const previous = data.reports.find((r) => r.id === previousId);
  const comparisons = useMemo(
    () =>
      previous && selected
        ? compareWeeklyItems(previous.items, selected.items)
        : [],
    [previous, selected],
  );
  const [filter, setFilter] = useState("all");
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
      {documents.map((d) => (
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
            <a
              className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm"
              href={`/api/files/${d.id}?view=1`}
              target="_blank"
              rel="noreferrer"
            >
              Buka asli ↗
            </a>
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
                    ? "Coba lagi"
                    : "Buka / buat draf"}
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {historyOnly
              ? "Bukti & jejak keputusan"
              : "Pantauan berbasis laporan"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            {historyOnly
              ? "Dokumen dan riwayat yang bisa ditelusuri"
              : "Apa yang berubah sejak laporan terakhir?"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            File vendor tetap asli. Draf SSO, keputusan direktur, dan catatan
            kirim tersimpan terpisah.
          </p>
        </div>
        {canWrite && folderId && (
          <Button
            disabled={pending}
            onClick={() => {
              setUploadId(null);
              setModal("upload");
            }}
          >
            <Upload size={16} /> Unggah laporan
          </Button>
        )}
      </div>
      {!historyOnly && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-muted-foreground">PIC laporan</p>
            <p className="mt-1 font-semibold">{owner || "Belum ditetapkan"}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-muted-foreground">
              Target menerima dari vendor
            </p>
            <p className="mt-1 font-semibold">
              {data.settings?.vendorDueAt
                ? formatDate(data.settings.vendorDueAt)
                : "Belum ditetapkan"}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-muted-foreground">
              Target mengirim ke customer
            </p>
            <p className="mt-1 font-semibold">
              {data.settings?.customerDueAt
                ? formatDate(data.settings.customerDueAt)
                : "Belum ditetapkan"}
            </p>
          </div>
          {canAssign && (
            <Button
              variant="outline"
              className="sm:col-span-3 sm:justify-self-end"
              onClick={() => setModal("settings")}
            >
              Atur PIC dan target
            </Button>
          )}
        </div>
      )}
      {historyOnly ? (
        <>
          {sourceList}
          <div className="space-y-3">
            {data.reports.map((r) => (
              <details key={r.id} className="rounded-xl border bg-white p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  SSO · {r.number} · {formatDate(r.inspectionDate)}{" "}
                  {r.dateVerified ? "" : "· tanggal perlu diperiksa"}
                </summary>
                <div className="mt-3 space-y-3">
                  <a
                    className="text-sm text-primary underline"
                    href={`/api/progress-reports/${r.id}/pdf?view=1`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Lihat draf kerja
                  </a>
                  {!r.reviews.length && (
                    <p className="text-xs text-muted-foreground">
                      Belum ada persetujuan atau catatan kirim di aplikasi.
                      Status pengiriman lama tidak diasumsikan.
                    </p>
                  )}
                  {r.reviews.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-lg bg-slate-50 p-3 text-sm"
                    >
                      <b>
                        Versi {v.version} · {reviewLabels[v.status]}
                      </b>
                      <p className="text-xs text-muted-foreground">
                        Diajukan {formatDate(v.requestedAt)}
                        {v.decidedAt
                          ? ` · Diputuskan ${formatDate(v.decidedAt)}`
                          : ""}
                      </p>
                      {v.decisionNote && <p>{v.decisionNote}</p>}
                      {v.dispatch && (
                        <p className="mt-2">
                          Dikonfirmasi {v.dispatch.recordedByName} ·{" "}
                          {v.dispatch.channel} → {v.dispatch.recipient} ·{" "}
                          {formatDate(v.dispatch.sentAt)}
                          <span className="block text-xs text-muted-foreground">
                            Catatan manual, bukan konfirmasi penerimaan
                            customer.
                          </span>
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
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <section className="min-w-0 space-y-4 rounded-2xl border bg-white p-4 sm:p-6">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-medium">
                  Laporan sebelumnya
                  <Select
                    className="mt-2"
                    aria-label="Laporan sebelumnya"
                    value={previousId}
                    onChange={(e) => setPreviousChoice(e.target.value)}
                  >
                    <option value="">
                      {previousCandidates.length > 1
                        ? "Ada beberapa versi — pilih pembanding"
                        : "Pilih pembanding / laporan pertama"}
                    </option>
                    {prior.map((r) => (
                      <option key={r.id} value={r.id}>
                        {formatDate(r.inspectionDate)} · {r.number}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="text-xs font-medium">
                  Laporan yang dipantau
                  <Select
                    className="mt-2"
                    aria-label="Laporan yang dipantau"
                    value={selectedId}
                    onChange={(e) => {
                      setSelectedId(e.target.value);
                      setPreviousChoice(null);
                    }}
                  >
                    <option value="">
                      {candidates.length > 1
                        ? "Beberapa versi pada tanggal terbaru — pilih"
                        : "Pilih laporan"}
                    </option>
                    {data.reports.map((r) => (
                      <option key={r.id} value={r.id}>
                        {formatDate(r.inspectionDate)} · {r.number}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              {!selected ? (
                <div className="rounded-xl bg-slate-50 p-6 text-sm">
                  {data.reports.length
                    ? "Pilih versi laporan yang benar. Tanggal sama atau nama file sama belum membuktikan isinya sama."
                    : "Unggah laporan vendor. Aplikasi akan menyiapkan draf SSO dan menyimpan sumbernya."}
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-emerald-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      Ringkasan laporan · {formatDate(selected.inspectionDate)}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed">
                      {selected.summary ||
                        "Ringkasan belum tersedia. Periksa rincian dan sumber laporan."}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {selected.dateVerified
                        ? "Tanggal dibaca dari dokumen; periksa kesesuaiannya."
                        : "Tanggal belum terverifikasi; dapat berasal dari tanggal unggah atau nama file."}{" "}
                      Ini isi laporan pada tanggal tersebut, bukan pembaruan
                      otomatis kondisi hari ini.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.source && !selected.source.deletedAt && (
                      <a
                        className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm"
                        href={`/api/files/${selected.source.id}?view=1`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {selected.source.progressFormat === "VENDOR"
                          ? "Vendor · asli"
                          : selected.source.progressFormat === "SSO"
                            ? "SSO · unggahan"
                            : "Sumber · format belum ditetapkan"}{" "}
                        ↗
                      </a>
                    )}
                    <a
                      className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm"
                      href={`/api/progress-reports/${selected.id}/pdf?view=1`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      SSO · draf kerja ↗
                    </a>
                    {canWrite && (
                      <Button
                        variant="outline"
                        onClick={() => setModal("details")}
                      >
                        Periksa draf
                      </Button>
                    )}
                  </div>
                  {previous ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {["all", "changed", "unchanged", "ambiguous"].map(
                          (f) => (
                            <button
                              key={f}
                              onClick={() => setFilter(f)}
                              className={`min-h-11 rounded-full border px-3 text-xs ${filter === f ? "bg-primary text-white" : "bg-white"}`}
                            >
                              {f === "all"
                                ? "Semua temuan"
                                : f === "ambiguous"
                                  ? "Perlu klarifikasi"
                                  : CHANGE_LABELS[f as "changed" | "unchanged"]}
                            </button>
                          ),
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Keterangan sama tidak membuktikan pekerjaan macet. Item
                        hilang tidak dianggap selesai. Cocokkan hasil dengan
                        sumber asli.
                      </p>
                      <div className="space-y-3">
                        {comparisons
                          .filter(
                            (c) =>
                              filter === "all" ||
                              (filter === "ambiguous"
                                ? ["ambiguous", "missing", "new"].includes(
                                    c.kind,
                                  )
                                : c.kind === filter),
                          )
                          .map((c) => (
                            <div key={c.key} className="rounded-xl border p-4">
                              <p className="text-xs text-muted-foreground">
                                {(c.after ?? c.before)?.sectionName ||
                                  "Unit belum jelas"}{" "}
                                · {CHANGE_LABELS[c.kind]}
                              </p>
                              <h3 className="mt-1 text-sm font-semibold">
                                {(c.after ?? c.before)?.partName}{" "}
                                <span className="font-normal text-muted-foreground">
                                  {(c.after ?? c.before)?.quantity}
                                </span>
                              </h3>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                                  <p className="mb-1 text-xs text-muted-foreground">
                                    Sebelumnya
                                  </p>
                                  {c.before?.notes ||
                                    (c.before
                                      ? "Tanpa keterangan"
                                      : "Belum ditemukan padanan")}
                                  <p className="mt-1 text-xs">
                                    {c.before?.isDone ? "Tercatat selesai" : ""}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-emerald-50/60 p-3 text-sm">
                                  <p className="mb-1 text-xs text-muted-foreground">
                                    Laporan dipilih
                                  </p>
                                  {c.after?.notes ||
                                    (c.after
                                      ? "Tanpa keterangan"
                                      : "Tidak ditemukan padanan")}
                                  <p className="mt-1 text-xs">
                                    {c.after?.isDone ? "Tercatat selesai" : ""}
                                  </p>
                                </div>
                              </div>
                              {canAssign && (
                                <Button
                                  variant="outline"
                                  className="mt-3"
                                  onClick={() => {
                                    setFinding(c);
                                    setModal("followup");
                                  }}
                                >
                                  Buat tindak lanjut <ArrowRight size={14} />
                                </Button>
                              )}
                            </div>
                          ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      {prior.length
                        ? "Pilih satu laporan sebelumnya untuk melihat perubahan."
                        : "Belum ada laporan lebih awal. Laporan ini menjadi titik awal riwayat; belum ada perubahan yang dapat disimpulkan."}
                    </div>
                  )}
                </>
              )}
            </section>
            <section className="space-y-4">
              <div className="rounded-2xl border bg-white p-5">
                <FileCheck2 className="text-primary" size={22} />
                <h3 className="mt-3 font-semibold">Persetujuan & pengiriman</h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  Direktur: {data.approverName || "Akun belum tersedia"}.
                  Persetujuan terikat salinan versi yang diperiksa.
                </p>
                {selected && (
                  <div className="mt-4 space-y-3">
                    <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold">
                      {review
                        ? `Versi ${review.version} · ${reviewLabels[review.status]}${review.isCurrent ? "" : " · Draf sudah berubah"}`
                        : "Draf · belum diajukan"}
                    </p>
                    {review && (
                      <>
                        <a
                          className="inline-flex min-h-11 items-center text-sm text-primary underline"
                          href={`/api/report-reviews/${review.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Buka salinan versi {review.version} ↗
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {notificationLabels[review.notificationStatus]}
                        </p>
                        {review.decisionNote && (
                          <p className="rounded-lg bg-amber-50 p-3 text-sm">
                            {review.decisionNote}
                          </p>
                        )}
                      </>
                    )}
                    {canWrite && (
                      <Button
                        className="w-full"
                        disabled={pending || !data.approverName}
                        onClick={() =>
                          action("Permintaan persetujuan tersimpan", () =>
                            requestReportReview(selected.id),
                          )
                        }
                      >
                        {review ? "Ajukan versi terkini" : "Ajukan ke direktur"}
                      </Button>
                    )}
                    {data.isApprover &&
                      review?.status === "PENDING" &&
                      review.isCurrent && (
                        <>
                          <p className="text-xs">
                            Periksa salinan PDF, tanggal, isi, dan foto sebelum
                            memutuskan.
                          </p>
                          <Button
                            disabled={pending}
                            className="w-full"
                            onClick={() =>
                              action("Laporan disetujui", () =>
                                decideReportReview(review.id, "APPROVED", ""),
                              )
                            }
                          >
                            Setujui versi {review.version}
                          </Button>
                          <Button
                            disabled={pending}
                            variant="outline"
                            className="w-full"
                            onClick={() => setModal("reject")}
                          >
                            Minta revisi
                          </Button>
                        </>
                      )}
                    {review?.status === "APPROVED" && review.isCurrent && (
                      <>
                        {!review.dispatch && canWrite ? (
                          <Button
                            disabled={pending}
                            variant="outline"
                            className="w-full"
                            onClick={() => setModal("send")}
                          >
                            Tandai sudah dikirim
                          </Button>
                        ) : (
                          review.dispatch && (
                            <div className="rounded-xl bg-emerald-50 p-3 text-sm">
                              <b>Pengiriman dicatat</b>
                              <p>
                                {review.dispatch.channel} →{" "}
                                {review.dispatch.recipient}
                              </p>
                              <p className="text-xs">
                                Oleh {review.dispatch.recordedByName} ·{" "}
                                {formatDate(review.dispatch.sentAt)}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Konfirmasi manual, bukan tanda diterima atau
                                dibaca customer.
                              </p>
                            </div>
                          )
                        )}
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Perubahan draf memerlukan persetujuan baru. Membuka
                      WhatsApp atau mengunduh PDF tidak dianggap sebagai
                      pengiriman.
                    </p>
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600">
                <AlertCircle size={16} className="mb-2" />
                Progres mengikuti bukti laporan. Pembayaran dan jumlah centang
                tidak diubah menjadi persentase pekerjaan.
              </div>
            </section>
          </div>
          <details className="rounded-xl border bg-white p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <History size={16} /> Semua sumber laporan ({documents.length})
            </summary>
            <div className="mt-4">{sourceList}</div>
          </details>
        </>
      )}
      <Dialog
        open={modal === "upload"}
        onOpenChange={(open) => !open && !pending && setModal(null)}
        title="Unggah laporan"
        description="File asli disimpan, kemudian draf SSO disiapkan otomatis."
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
            Dokumen PDF / gambar
            <Input
              name="file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              required={!uploadId}
              disabled={pending || Boolean(uploadId)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Akun pengunggah dan waktu masuk otomatis dicatat. Pemrosesan AI
            dapat memerlukan beberapa menit. Dokumen tidak otomatis dikirim ke
            customer.
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
