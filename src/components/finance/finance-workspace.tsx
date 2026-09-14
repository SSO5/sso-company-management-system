"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Plus,
  Wallet,
  AlertCircle,
} from "lucide-react";
import {
  getFinanceWorkspace,
  saveFinanceWork,
  saveBankBalance,
  saveProjectEstimate,
} from "@/server/finance/workspace";
import { forecastMargin, issuedInvoice } from "@/lib/finance-overview";
import { formatCurrency as money, formatDate } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
type Data = Awaited<ReturnType<typeof getFinanceWorkspace>>;
type Work = {
  id?: string;
  title: string;
  kind: "BILLING" | "VENDOR" | "TAX" | "COMPANY";
  projectId: string | null;
  reference: string | null;
  ownerId: string | null;
  dueAt: string | null;
  status: "OPEN" | "WAITING" | "READY" | "DONE";
  checks: { label: string; done: boolean; ownerId?: string | null }[];
  notes: string | null;
};
const blank = (): Work => ({
  title: "",
  kind: "BILLING",
  projectId: null,
  reference: null,
  ownerId: null,
  dueAt: null,
  status: "OPEN",
  checks: [],
  notes: null,
});
const states: Record<string, string> = {
  OPEN: "Perlu dikerjakan",
  WAITING: "Menunggu",
  READY: "Siap diproses",
  DONE: "Selesai",
  DRAFT: "Draf",
  SUBMITTED: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Perlu revisi",
  ISSUED: "Diterbitkan",
  PARTIALLY_PAID: "Dibayar sebagian",
  PAID: "Lunas",
  OVERDUE: "Lewat jatuh tempo",
  CANCELLED: "Dibatalkan",
  SENT: "Dikirim",
  CONFIRMED: "Dikonfirmasi",
  UNPAID: "Belum dibayar",
};
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
export function FinanceWorkspace({ data }: { data: Data }) {
  const params = useSearchParams(),
    router = useRouter(),
    { toast } = useToast();
  const tab = params.get("tab") || "actions";
  const [project, setProject] = useState("");
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [work, setWork] = useState<Work | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [estimate, setEstimate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState("");
  const canEdit = ["ADMIN", "FINANCE", "IT"].includes(data.role),
    canCreate = ["ADMIN", "FINANCE"].includes(data.role);
  const matches = (text: string) =>
    text.toLowerCase().includes(search.toLowerCase());
  const userName = (id: string | null | undefined) =>
    data.users.find((u) => u.id === id)?.name || "Belum ditetapkan";
  const projectName = (id: string | null) =>
    data.projects.find((p) => p.id === id)?.number ||
    "Perusahaan / belum terhubung";
  const orders = data.orders.filter(
    (o) =>
      (!project || o.projectId === project) &&
      matches(`${o.number} ${o.customer} ${o.project}`),
  );
  const problems = data.invoices.filter(
    (i) =>
      i.status !== "CANCELLED" &&
      (!i.poId ||
        Math.abs(i.paidAmount - i.paymentRows) > 0.01 ||
        Math.abs(i.withholdingTax - i.withholdingRows) > 0.01),
  );
  const activeWork = data.work.filter((w) => w.status !== "DONE");
  const attention = data.invoices.filter(
    (i) =>
      ["DRAFT", "SUBMITTED", "REJECTED", "APPROVED"].includes(i.status) ||
      (issuedInvoice(i.status) &&
        i.outstanding > 0 &&
        new Date(i.due) < new Date()),
  );
  const nextBilling = data.orders.filter((o) => o.value > o.billed + 0.01);
  const possibleOrderDuplicates = data.orders.filter((o, i, all) =>
    all.some(
      (other, j) =>
        i !== j &&
        other.customer === o.customer &&
        other.value === o.value &&
        other.date === o.date,
    ),
  );
  const paidIn = data.payments.filter(
    (p) => !month || p.date.startsWith(month),
  );
  const approvedExpenses = data.expenses.filter((e) => e.status === "APPROVED"),
    approvedCompany = data.company.filter((e) => e.status === "APPROVED");
  const bankLatest = data.bank.filter(
    (b, i, all) =>
      all.findIndex(
        (x) => x.bankName.toLowerCase() === b.bankName.toLowerCase(),
      ) === i,
  );
  const sameBankDate =
    new Set(bankLatest.map((b) => b.asOf.slice(0, 10))).size === 1;
  async function save(job: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    try {
      const r = await job();
      if (!r.ok) throw new Error(r.error);
      setWork(null);
      setBankOpen(false);
      setEstimate(null);
      router.refresh();
      toast({ title: "Perubahan tersimpan", variant: "success" });
    } catch (e) {
      toast({
        title: "Belum tersimpan",
        description: e instanceof Error ? e.message : "Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }
  function newWork(
    title = "",
    reference: string | null = null,
    projectId: string | null = null,
  ) {
    setWork({ ...blank(), title, reference, projectId });
  }
  function docLinks(id: string, projectId?: string | null) {
    const docs = data.documents.filter((d) => d.relatedEntityId === id);
    return docs.length ? (
      <div className="mt-2 flex flex-wrap gap-2">
        {docs.map((d) => (
          <a
            key={d.id}
            href={`/api/files/${d.id}?view=1`}
            data-document-title={d.originalName}
            className="rounded-lg border px-3 py-2 text-xs text-primary"
          >
            {d.originalName}
          </a>
        ))}
      </div>
    ) : projectId ? (
      <Link
        href={`/projects/${projectId}?tab=documents`}
        className="mt-2 inline-block text-xs text-primary"
      >
        Telusuri dokumen proyek →
      </Link>
    ) : null;
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Finance SSO
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Uang jelas. Pekerjaan berikutnya jelas.
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Telusuri PO, penagihan, pembayaran vendor, dan posisi perusahaan
            dari catatan yang sama.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => newWork()}>
            <Plus className="h-4 w-4" />
            Catat pekerjaan
          </Button>
        )}
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Invoice sudah diterbitkan"
          value={money(data.totals.billed)}
          note="Akumulasi termin yang diterbitkan. Draf belum termasuk."
        />
        <Metric
          label="Piutang belum diselesaikan"
          value={money(data.totals.outstanding)}
          note="Tagihan dikurangi kas dan potongan yang tercatat."
        />
        <Metric
          label="Kas masuk tercatat"
          value={money(data.payments.reduce((s, p) => s + p.amount, 0))}
          note="Dari catatan penerimaan. Bukan saldo rekening."
        />
        <Metric
          label="Pekerjaan Finance terbuka"
          value={String(
            activeWork.length + attention.length + nextBilling.length,
          )}
          note="Pekerjaan tim, invoice, dan PO yang perlu pemeriksaan termin berikutnya."
        />
      </div>
      <nav
        className="flex gap-1 overflow-x-auto rounded-2xl bg-muted/60 p-1"
        aria-label="Bagian Finance"
      >
        {[
          ["actions", "Perlu tindakan"],
          ["billing", "Keuangan proyek"],
          ["vendor", "Vendor"],
          ["company", "Perusahaan"],
          [
            "review",
            `Cek data${problems.length ? ` (${problems.length})` : ""}`,
          ],
        ].map(([id, label]) => (
          <Link
            key={id}
            href={`/finance?tab=${id}`}
            aria-current={tab === id ? "page" : undefined}
            className={`min-h-11 shrink-0 rounded-xl px-4 py-3 text-sm transition-colors ${tab === id ? "bg-card font-semibold text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "actions" && (
        <div className="grid items-start gap-5 xl:grid-cols-[1.3fr_1fr]">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pekerjaan & prasyarat</h2>
              <label className="flex min-h-11 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={showDone}
                  onChange={(e) => setShowDone(e.target.checked)}
                />
                Tampilkan selesai
              </label>
            </div>
            {data.work
              .filter((w) => showDone || w.status !== "DONE")
              .map((w) => {
                const checks = w.checks as Work["checks"];
                return (
                  <article
                    key={w.id}
                    className="rounded-2xl border bg-card p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="text-xs text-primary">
                          {states[w.status]} · {projectName(w.projectId)}
                        </p>
                        <h3 className="mt-1 font-semibold">{w.title}</h3>
                      </div>
                      {canCreate && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setWork({
                              ...w,
                              kind: w.kind as Work["kind"],
                              status: w.status as Work["status"],
                              dueAt: w.dueAt?.slice(0, 10) ?? null,
                              checks,
                            })
                          }
                        >
                          Perbarui
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {userName(w.ownerId)} ·{" "}
                      {w.dueAt
                        ? `Target ${formatDate(w.dueAt)}`
                        : "Target belum ditetapkan"}
                      {w.reference ? ` · ${w.reference}` : ""}
                    </p>
                    <div className="mt-3 space-y-2">
                      {checks.map((c, i) => (
                        <p key={i} className="flex gap-2 text-sm">
                          <span
                            className={
                              c.done ? "text-emerald-700" : "text-amber-700"
                            }
                          >
                            {c.done ? "✓" : "○"}
                          </span>
                          {c.label}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {userName(c.ownerId)}
                          </span>
                        </p>
                      ))}
                    </div>
                    {w.notes && (
                      <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
                        {w.notes}
                      </p>
                    )}
                  </article>
                );
              })}
            {!activeWork.length && !showDone && (
              <div className="rounded-2xl border border-dashed p-6">
                <h3 className="font-medium">
                  Catat hambatan yang perlu dituntaskan tim
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Contoh: penagihan menunggu BAST, cap, meterai, atau verifikasi
                  customer. Setiap prasyarat dapat memiliki PIC berbeda.
                </p>
                {canCreate && (
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() =>
                      setWork({
                        ...blank(),
                        title: "Siapkan kelengkapan penagihan",
                        checks: [
                          {
                            label: "PO dan termin sudah dicocokkan",
                            done: false,
                          },
                          {
                            label: "Invoice dan lampiran diperiksa",
                            done: false,
                          },
                        ],
                      })
                    }
                  >
                    Siapkan pekerjaan penagihan
                  </Button>
                )}
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Dokumen perlu diproses</h2>
            {attention.map((i) => (
              <Link
                key={i.id}
                href={`/finance/invoices/${i.id}`}
                className="block rounded-2xl border bg-card p-4 transition-colors hover:border-primary"
              >
                <p className="text-xs text-primary">{states[i.status]}</p>
                <h3 className="mt-1 font-medium">{i.number}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {i.customer} · {i.poRef || "PO belum dihubungkan"}
                </p>
                <p className="mt-3 text-sm">
                  {i.status === "APPROVED"
                    ? "Periksa dan terbitkan invoice"
                    : i.status === "SUBMITTED"
                      ? "Menunggu keputusan pemberi persetujuan"
                      : i.status === "REJECTED"
                        ? "Perbaiki draf sesuai catatan"
                        : i.status === "DRAFT"
                          ? "Lengkapi dan ajukan draf invoice"
                          : "Tindak lanjuti pembayaran"}{" "}
                  →
                </p>
              </Link>
            ))}
            {!attention.length && (
              <p className="rounded-2xl border p-5 text-sm text-muted-foreground">
                Tidak ada invoice yang memenuhi kategori tindakan ini.
              </p>
            )}
            <h3 className="pt-3 font-semibold">Periksa termin berikutnya</h3>
            <p className="text-xs text-muted-foreground">
              Sisa nilai PO belum berarti sudah boleh ditagih. Cocokkan syarat
              kontrak, bukti pekerjaan, serta invoice dari luar aplikasi.
            </p>
            {nextBilling.map((o) => (
              <div key={o.id} className="rounded-xl border p-4">
                <p className="text-sm font-medium">{o.number}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {o.customer} · sisa tercatat {money(o.value - o.billed)}
                </p>
                <p className="mt-2 text-xs">
                  {o.terms || "Termin belum dicatat"}
                </p>
                {canCreate && (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      newWork(
                        `Periksa kelengkapan termin ${o.number}`,
                        o.number,
                        o.projectId,
                      )
                    }
                  >
                    Catat tindak lanjut
                  </Button>
                )}
              </div>
            ))}
            {!!problems.length && (
              <Link
                className="block rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                href="/finance?tab=review"
              >
                {problems.length} invoice perlu pencocokan data →
              </Link>
            )}
            <Notice>
              Penyelesaian pekerjaan tidak otomatis mengubah invoice menjadi
              lunas atau uang menjadi diterima. Bukti pembayaran tetap dicatat
              pada transaksi.
            </Notice>
          </section>
        </div>
      )}
      {tab === "billing" && (
        <section className="space-y-5">
          <div className="flex flex-wrap gap-3">
            <Input
              aria-label="Cari PO atau customer"
              placeholder="Cari nomor PO, customer, pekerjaan…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <Select
              aria-label="Filter proyek"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="max-w-md"
            >
              <option value="">Semua proyek</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} · {p.name}
                </option>
              ))}
            </Select>
            {canCreate && (
              <Link href="/finance/invoices/new">
                <Button>Buat invoice</Button>
              </Link>
            )}
            <Link
              href="/finance/invoices"
              className="px-3 py-3 text-sm text-primary"
            >
              Semua invoice →
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Susunan mengikuti rekap Dwiki: PO → termin → invoice → penerimaan →
            sisa. Draf dan tagihan terbit dibedakan.
          </p>
          {orders.map((o) => (
            <article
              key={o.id}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {o.customer} · {projectName(o.projectId)}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{o.number}</h2>
                  <p className="mt-1 text-sm">{o.project}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Termin sesuai PO: {o.terms || "Belum dicatat"}
                  </p>
                  {docLinks(o.id, o.projectId)}
                </div>
                <p className="text-right text-lg font-semibold">
                  {money(o.value)}
                  <span className="block text-xs font-normal text-muted-foreground">
                    Nilai PO tercatat
                  </span>
                </p>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-4">
                {[
                  ["Sudah ditagih", o.billed],
                  ["Draf disiapkan", o.drafts],
                  ["Piutang", o.outstanding],
                  ["Sisa belum ditagih", Math.max(0, o.value - o.billed)],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 font-semibold">{money(Number(value))}</p>
                  </div>
                ))}
              </div>
              {o.billed > o.value + 0.01 && (
                <Notice>
                  Tagihan yang terhubung melebihi nilai PO. Periksa alokasi dan
                  kemungkinan duplikat.
                </Notice>
              )}
              <div className="divide-y">
                {data.invoices
                  .filter((i) => i.poId === o.id && i.status !== "CANCELLED")
                  .map((i) => (
                    <div
                      key={i.id}
                      className="grid items-center gap-3 p-4 lg:grid-cols-[1.3fr_1fr_1fr_auto]"
                    >
                      <div>
                        <Link
                          href={`/finance/invoices/${i.id}`}
                          className="text-sm font-semibold text-primary"
                        >
                          {i.number}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {i.dpPercent
                            ? `Termin ${i.dpPercent}%`
                            : "Sesuai nominal invoice"}{" "}
                          · {states[i.status]}
                        </p>
                        <p className="mt-1 text-xs">
                          Jatuh tempo {formatDate(i.due)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Tagihan</p>
                        <p className="text-sm font-medium">
                          {money(i.dueAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Kas / potongan tercatat
                        </p>
                        <p className="text-sm">
                          {money(i.paidAmount)} / {money(i.withholdingTax)}
                        </p>
                      </div>
                      <a
                        href={`/api/invoices/${i.id}/pdf?view=1`}
                        data-document-title={i.number}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"
                      >
                        <FileText className="h-4 w-4" />
                        Lihat invoice
                      </a>
                    </div>
                  ))}
                {!data.invoices.some(
                  (i) => i.poId === o.id && i.status !== "CANCELLED",
                ) && (
                  <p className="p-4 text-sm text-muted-foreground">
                    Belum ada invoice yang cocok dengan nomor PO ini. Periksa
                    juga Cek data sebelum membuat invoice baru.
                  </p>
                )}
              </div>
            </article>
          ))}
          {!orders.length && (
            <p className="rounded-xl border p-5">
              Tidak ada PO yang cocok dengan filter.
            </p>
          )}
          <h2 className="text-lg font-semibold">Proyeksi hasil proyek</h2>
          <Notice>
            Margin di bawah adalah proyeksi berdasarkan nilai penjualan neto dan
            seluruh perkiraan biaya yang diisi Finance. Biaya yang belum
            diketahui harus masuk estimasi. Ini bukan laba aktual atau saldo
            kas.
          </Notice>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.projects
              .filter((p) => !project || p.id === project)
              .map((p) => {
                const e = data.estimates.find((e) => e.projectId === p.id),
                  m = e
                    ? forecastMargin(e.netSales, e.totalForecastCost)
                    : null;
                return (
                  <article key={p.id} className="rounded-2xl border p-5">
                    <p className="text-xs text-muted-foreground">{p.number}</p>
                    <h3 className="mt-1 font-semibold">{p.name}</h3>
                    <p className="mt-3 text-xl font-semibold">
                      {m ? money(m.margin) : "Proyeksi belum lengkap"}
                    </p>
                    {m && (
                      <p className="text-sm">
                        {m.percent}% proyeksi margin ·{" "}
                        {m.margin < 0
                          ? "Perkiraan biaya melebihi penjualan"
                          : "Berdasarkan estimasi tercatat"}
                      </p>
                    )}
                    {e && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {e.basis} · Diperbarui {formatDate(e.updatedAt)}
                      </p>
                    )}
                    {canEdit && (
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setEstimate(p.id)}
                      >
                        Perbarui dasar proyeksi
                      </Button>
                    )}
                  </article>
                );
              })}
          </div>
        </section>
      )}
      {tab === "vendor" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                Komitmen dan biaya vendor
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                PO vendor dan biaya yang terhubung ditampilkan bersama agar
                tidak dihitung dua kali.
              </p>
            </div>
            <Link
              href="/procurement/vendor-po"
              className="text-sm text-primary"
            >
              Kelola PO vendor →
            </Link>
            <Link href="/finance/expenses" className="text-sm text-primary">
              Catat / bayar biaya →
            </Link>
          </div>
          {data.vendors.map((v) => (
            <article key={v.id} className="rounded-2xl border p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{v.name}</h3>
                  <Link
                    href={`/procurement/vendor-po/${v.id}`}
                    className="text-sm text-primary"
                  >
                    {v.number}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {projectName(v.projectId)} ·{" "}
                    {v.reference || "Rujukan customer belum dicatat"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{money(v.total)}</p>
                  <p className="text-xs">{states[v.status]}</p>
                </div>
              </div>
              <p className="mt-3 text-sm">
                Termin: {v.terms || "Belum dicatat"}
              </p>
              <p className="mt-2 text-sm">
                Biaya terkait:{" "}
                {v.expenseId
                  ? states[v.paymentStatus || ""]
                  : "Belum terhubung; nilai PO belum dapat dianggap saldo utang"}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`/api/procurement/vendor-po/${v.id}/pdf?view=1`}
                  data-document-title={v.number}
                  className="rounded-lg border px-3 py-2 text-sm text-primary"
                >
                  Lihat PO
                </a>
                {v.projectId && (
                  <Link
                    href={`/finance/expenses?project=${v.projectId}`}
                    className="rounded-lg border px-3 py-2 text-sm text-primary"
                  >
                    Buka biaya & pembayaran
                  </Link>
                )}
                {canCreate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setWork({
                        ...blank(),
                        kind: "VENDOR",
                        title: `Tindak lanjut ${v.number}`,
                        reference: v.number,
                        projectId: v.projectId,
                      })
                    }
                  >
                    Catat tindak lanjut
                  </Button>
                )}
              </div>
              {docLinks(v.id, v.projectId)}
            </article>
          ))}
          <Notice>
            Status biaya “Lunas” saat ini merupakan catatan per biaya. Riwayat
            cicilan vendor belum tersedia; nilai PO tidak boleh langsung
            dianggap sudah dibayar seluruhnya.
          </Notice>
        </section>
      )}
      {tab === "company" && (
        <section className="space-y-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Posisi perusahaan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Seluruh proyek ditambah beban operasional perusahaan. Angka
                mengikuti cakupan data yang tercatat.
              </p>
            </div>
            {canCreate && (
              <Button variant="outline" onClick={() => setBankOpen(true)}>
                <Wallet className="h-4 w-4" />
                Catat saldo rekening
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Saldo rekening menurut dokumen"
              value={
                bankLatest.length && sameBankDate
                  ? money(bankLatest.reduce((s, b) => s + b.amount, 0))
                  : "Belum dapat dijumlahkan"
              }
              note={
                bankLatest.length
                  ? sameBankDate
                    ? `${bankLatest.length} rekening tercatat, per ${formatDate(bankLatest[0].asOf)}. Bukan rekonsiliasi otomatis.`
                    : "Tanggal saldo antar rekening berbeda; samakan tanggal terlebih dahulu."
                  : "Tambahkan saldo bertanggal dengan dokumen sumber."
              }
            />
            <Metric
              label="Biaya proyek disetujui"
              value={money(approvedExpenses.reduce((s, e) => s + e.total, 0))}
              note="Termasuk biaya vendor yang sudah menjadi catatan biaya. Bukan ditambah lagi nilai PO vendor."
            />
            <Metric
              label="Beban perusahaan disetujui"
              value={money(approvedCompany.reduce((s, e) => s + e.total, 0))}
              note="Beban operasional umum dicatat terpisah dari biaya proyek."
            />
          </div>
          {bankLatest.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap justify-between gap-3 rounded-xl border p-4"
            >
              <div>
                <p className="font-medium">{b.bankName}</p>
                <p className="text-xs text-muted-foreground">
                  Menurut dokumen per {formatDate(b.asOf)}
                </p>
              </div>
              <p className="font-semibold">{money(b.amount)}</p>
              <a
                className="text-sm text-primary"
                href={`/api/files/${b.sourceDocumentId}?view=1`}
              >
                Lihat bukti saldo
              </a>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/finance/company-expenses"
              className="rounded-xl border px-4 py-3 text-sm text-primary"
            >
              Kelola beban operasional →
            </Link>
            <Link
              href="/finance/expenses"
              className="rounded-xl border px-4 py-3 text-sm text-primary"
            >
              Kelola biaya proyek →
            </Link>
            <Link
              href="/finance/payments"
              className="rounded-xl border px-4 py-3 text-sm text-primary"
            >
              Catat penerimaan →
            </Link>
          </div>
          <Notice>
            Laba aktual perusahaan belum dapat disimpulkan dari invoice
            dikurangi pembayaran. Pencatatan biaya belum lengkap dan belum ada
            buku besar serta rekonsiliasi bank menyeluruh. Proyeksi proyek
            tersedia di Keuangan proyek.
          </Notice>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Penerimaan kas yang tercatat
            </h2>
            <label className="flex items-center gap-2 text-sm">
              Bulan
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric
              label="Uang masuk"
              value={money(paidIn.reduce((s, p) => s + p.amount, 0))}
              note={
                month
                  ? `Periode ${month}`
                  : "Seluruh periode pembayaran yang tercatat"
              }
            />
            <Metric
              label="Potongan customer"
              value={money(paidIn.reduce((s, p) => s + p.withholding, 0))}
              note="Dicatat terpisah dari uang yang masuk rekening."
            />
          </div>
          {paidIn.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            >
              <div>
                <p className="text-sm font-medium">{p.customer}</p>
                <Link
                  href={`/finance/invoices/${p.invoiceId}`}
                  className="text-xs text-primary"
                >
                  {p.invoice} · {formatDate(p.date)}
                </Link>
                {docLinks(p.id)}
              </div>
              <p className="flex items-center gap-2 font-semibold text-emerald-700">
                <ArrowDownLeft className="h-4 w-4" />
                {money(p.amount)}
              </p>
            </div>
          ))}
        </section>
      )}
      {tab === "review" && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            Pastikan angka punya dasar yang sama
          </h2>
          <Notice>
            Rekap Excel dan catatan aplikasi tidak saling menimpa otomatis.
            Tanggal, nomor PO lengkap, nominal termin, kas, potongan, dan bukti
            diperiksa sebelum digabung.
          </Notice>
          {!!possibleOrderDuplicates.length && (
            <Notice>
              Ada PO dengan customer, tanggal, dan nominal yang sama:{" "}
              {possibleOrderDuplicates.map((o) => o.number).join(", ")}. Periksa
              dokumen aslinya sebelum menerbitkan invoice baru. Kesamaan ini
              belum membuktikan duplikat.
            </Notice>
          )}
          {problems.map((i) => (
            <article key={i.id} className="rounded-xl border p-4">
              <h3 className="font-medium">{i.number}</h3>
              <p className="text-sm text-muted-foreground">
                {i.customer} · {i.poRef || "Referensi PO kosong"}
              </p>
              <ul className="mt-3 list-inside list-disc text-sm">
                {!i.poId && (
                  <li>
                    Belum cocok persis dengan satu PO customer; belum
                    dialokasikan pada rekap per PO.
                  </li>
                )}
                {Math.abs(i.paidAmount - i.paymentRows) > 0.01 && (
                  <li>
                    Kas pada invoice {money(i.paidAmount)} berbeda dari rincian
                    pembayaran {money(i.paymentRows)}.
                  </li>
                )}
                {Math.abs(i.withholdingTax - i.withholdingRows) > 0.01 && (
                  <li>
                    Potongan pada invoice berbeda dari rincian pembayaran.
                    Cocokkan bukti potong.
                  </li>
                )}
              </ul>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href={`/finance/invoices/${i.id}`}
                  className="text-sm text-primary"
                >
                  Periksa invoice →
                </Link>
                {canCreate && (
                  <button
                    onClick={() =>
                      newWork(
                        `Cocokkan data ${i.number}`,
                        i.number,
                        i.projectId,
                      )
                    }
                    className="text-sm text-primary"
                  >
                    Catat tindak lanjut
                  </button>
                )}
              </div>
            </article>
          ))}
          {!problems.length && (
            <p className="rounded-xl border p-5 text-sm">
              Tidak ada selisih pada pemeriksaan otomatis ini. Kelengkapan
              seluruh transaksi tetap perlu pemeriksaan dokumen.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Dokumen yang belum jelas atau versi lama tidak dihapus berdasarkan
            nama saja. Rujukan transaksi dan laporan tetap dipertahankan.
          </p>
        </section>
      )}
      <Dialog
        open={!!work}
        onOpenChange={(open) => {
          if (!open && !busy) setWork(null);
        }}
        title={
          work?.id ? "Perbarui pekerjaan Finance" : "Catat pekerjaan Finance"
        }
        description="Pekerjaan ini membantu koordinasi; tidak menerbitkan invoice atau melakukan pembayaran."
      >
        {work && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save(() => saveFinanceWork(work));
            }}
          >
            <label className="block text-sm">
              Pekerjaan
              <Input
                required
                value={work.title}
                onChange={(e) => setWork({ ...work, title: e.target.value })}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Jenis
                <Select
                  value={work.kind}
                  onChange={(e) =>
                    setWork({ ...work, kind: e.target.value as Work["kind"] })
                  }
                >
                  {[
                    ["BILLING", "Penagihan"],
                    ["VENDOR", "Vendor"],
                    ["TAX", "Pajak & dokumen"],
                    ["COMPANY", "Perusahaan"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                Proyek
                <Select
                  value={work.projectId || ""}
                  onChange={(e) =>
                    setWork({ ...work, projectId: e.target.value || null })
                  }
                >
                  <option value="">Perusahaan / belum terhubung</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.number}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                PIC
                <Select
                  value={work.ownerId || ""}
                  onChange={(e) =>
                    setWork({ ...work, ownerId: e.target.value || null })
                  }
                >
                  <option value="">Belum ditetapkan</option>
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                Target
                <Input
                  type="date"
                  value={work.dueAt || ""}
                  onChange={(e) =>
                    setWork({ ...work, dueAt: e.target.value || null })
                  }
                />
              </label>
            </div>
            <label className="block text-sm">
              Nomor PO / invoice / rujukan
              <Input
                value={work.reference || ""}
                onChange={(e) =>
                  setWork({ ...work, reference: e.target.value })
                }
              />
            </label>
            <p className="text-sm font-medium">
              Prasyarat yang perlu diselesaikan
            </p>
            {work.checks.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Selesai: ${c.label}`}
                  checked={c.done}
                  onChange={(e) =>
                    setWork({
                      ...work,
                      checks: work.checks.map((x, j) =>
                        i === j ? { ...x, done: e.target.checked } : x,
                      ),
                    })
                  }
                />
                <Input
                  aria-label={`Prasyarat ${i + 1}`}
                  value={c.label}
                  onChange={(e) =>
                    setWork({
                      ...work,
                      checks: work.checks.map((x, j) =>
                        i === j ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                  className="min-w-0 flex-1"
                />
                <Select
                  aria-label={`PIC prasyarat ${i + 1}`}
                  className="max-w-40"
                  value={c.ownerId || ""}
                  onChange={(e) =>
                    setWork({
                      ...work,
                      checks: work.checks.map((x, j) =>
                        i === j ? { ...x, ownerId: e.target.value || null } : x,
                      ),
                    })
                  }
                >
                  <option value="">PIC</option>
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className="min-h-11 px-2 text-xs"
                  onClick={() =>
                    setWork({
                      ...work,
                      checks: work.checks.filter((_, j) => i !== j),
                    })
                  }
                >
                  Hapus
                </button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setWork({
                  ...work,
                  checks: [...work.checks, { label: "", done: false }],
                })
              }
            >
              Tambah prasyarat
            </Button>
            <label className="block text-sm">
              Status
              <Select
                value={work.status}
                onChange={(e) =>
                  setWork({ ...work, status: e.target.value as Work["status"] })
                }
              >
                {["OPEN", "WAITING", "READY", "DONE"].map((s) => (
                  <option key={s} value={s}>
                    {states[s]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              Hasil / hambatan / rujukan bukti
              <Textarea
                value={work.notes || ""}
                onChange={(e) => setWork({ ...work, notes: e.target.value })}
              />
            </label>
            <Button disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan pekerjaan"}
            </Button>
          </form>
        )}
      </Dialog>
      <Dialog
        open={bankOpen}
        onOpenChange={(open) => {
          if (!open && !busy) setBankOpen(false);
        }}
        title="Saldo rekening menurut dokumen"
        description="Catat posisi pada tanggal bukti. Rekening berbeda perlu nama yang konsisten; riwayat sebelumnya tetap disimpan."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            save(() => saveBankBalance(values));
          }}
        >
          <label className="block text-sm">
            Nama rekening / kas
            <Input
              name="bankName"
              required
              placeholder="Contoh: BCA Operasional SSO"
            />
          </label>
          <label className="block text-sm">
            Tanggal posisi saldo
            <Input type="date" name="asOf" required />
          </label>
          <label className="block text-sm">
            Saldo rupiah
            <Input type="number" step="0.01" min="0" name="amount" required />
          </label>
          <label className="block text-sm">
            Dokumen bukti
            <Select name="sourceDocumentId" required>
              <option value="">Pilih dokumen tersimpan</option>
              {data.documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.originalName}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-xs text-muted-foreground">
            Jika bukti belum ada, unggah melalui Data & Dokumen terlebih dahulu.
            Pencatatan ini tidak menyatakan seluruh rekening sudah
            direkonsiliasi.
          </p>
          <Button disabled={busy}>Simpan saldo bertanggal</Button>
        </form>
      </Dialog>
      <Dialog
        open={!!estimate}
        onOpenChange={(open) => {
          if (!open && !busy) setEstimate(null);
        }}
        title="Dasar proyeksi proyek"
        description="Gunakan dasar pajak yang konsisten. Estimasi mencakup biaya yang sudah dan masih akan terjadi; ini belum laba aktual."
      >
        {estimate && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              save(() =>
                saveProjectEstimate({ ...values, projectId: estimate }),
              );
            }}
          >
            <label className="block text-sm">
              Penjualan neto proyek (tanpa PPN keluaran)
              <Input
                name="netSales"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={
                  data.estimates.find((e) => e.projectId === estimate)?.netSales
                }
              />
            </label>
            <label className="block text-sm">
              Seluruh perkiraan biaya proyek
              <Input
                name="totalForecastCost"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={
                  data.estimates.find((e) => e.projectId === estimate)
                    ?.totalForecastCost
                }
              />
            </label>
            <label className="block text-sm">
              Dasar estimasi dan biaya yang sudah dicakup
              <Textarea
                name="basis"
                required
                minLength={20}
                defaultValue={
                  data.estimates.find((e) => e.projectId === estimate)?.basis
                }
                placeholder="Rujukan costing, subkon, tenaga kerja, transport, pajak yang menjadi beban, biaya sisa, serta tanggal estimasi…"
              />
            </label>
            <Button disabled={busy}>Simpan proyeksi</Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
