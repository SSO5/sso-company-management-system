import { WeeklyOverview } from "@/components/dashboard/weekly-overview";
import Link from "next/link";
import { getDashboardData } from "@/server/dashboard";
import { getMyActionItems } from "@/server/action-items";
import { requireUser } from "@/lib/auth/current-user";
import { ActionItemsPanel } from "@/components/dashboard/action-items-panel";
import { formatCurrency } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/workspace";
import { ArrowUpRight, Database, ListChecks } from "lucide-react";

export default async function DashboardPage() {
  const [actor, data, items] = await Promise.all([
    requireUser(),
    getDashboardData(),
    getMyActionItems(),
  ]);
  const { kpis } = data;
  const finance = ["ADMIN", "FINANCE", "VIEWER"].includes(actor.role);
  return (
    <div className="space-y-6">
      <div className="workspace-heading">
        <div>
          <p className="workspace-eyebrow">
            {ROLE_LABELS[actor.role]} ·{" "}
            {new Intl.DateTimeFormat("id-ID", {
              dateStyle: "full",
              timeZone: "Asia/Jakarta",
            }).format(new Date())}
          </p>
          <h1>Selamat bekerja, {actor.name.split(" ")[0]}.</h1>
          <p className="workspace-muted mt-2">
            {actor.role === "VIEWER"
              ? "Pantau penyimpangan dan keputusan yang memerlukan perhatian."
              : "Mulai dari yang paling penting. Lanjutkan pekerjaan di ruang yang tepat."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/work"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-white"
          >
            <ListChecks size={16} /> Buka pekerjaan saya <ArrowUpRight size={16} />
          </Link>
          <Link
            href="/data"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-5 py-3 text-sm font-medium text-primary"
          >
            <Database size={16} /> Unggah atau cari dokumen
          </Link>
        </div>
      </div>
      <section aria-labelledby="tindakan-sekarang">
        <div className="mb-3">
          <p className="workspace-eyebrow">1 · Tindakan</p>
          <h2 id="tindakan-sekarang" className="text-xl font-semibold">Apa yang harus diselesaikan sekarang?</h2>
        </div>
        <ActionItemsPanel
          items={items}
          limit={8}
          title={actor.role === "ADMIN" ? "Prioritas tim" : "Prioritas Anda"}
        />
      </section>
      <section aria-labelledby="perubahan-proyek">
        <div className="mb-3">
          <p className="workspace-eyebrow">2 · Proyek</p>
          <h2 id="perubahan-proyek" className="text-xl font-semibold">Apa yang berubah pada pekerjaan?</h2>
        </div>
        <WeeklyOverview />
      </section>
      {finance && (
        <section aria-labelledby="kondisi-keuangan">
          <div className="mb-3">
            <p className="workspace-eyebrow">3 · Keuangan</p>
            <h2 id="kondisi-keuangan" className="text-xl font-semibold">Bagaimana kondisi keuangan SSO?</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Link href="/finance" className="workspace-stat hover:bg-slate-50">
              <span className="text-sm text-slate-600">Saldo bank tercatat</span>
              <strong>{formatCurrency(kpis.latestCashBalance)}</strong>
              <small>{kpis.cashAsOf ? `Per ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(kpis.cashAsOf)}` : "Belum ada bukti saldo terbaru"}</small>
            </Link>
            <Link href="/finance/receivables" className="workspace-stat hover:bg-slate-50">
              <span className="text-sm text-slate-600">Piutang tercatat</span>
              <strong>{formatCurrency(kpis.outstandingReceivables)}</strong>
              <small>Dari invoice yang sudah diterbitkan</small>
            </Link>
            <Link href="/finance/expenses" className="workspace-stat hover:bg-slate-50">
              <span className="text-sm text-slate-600">Biaya disetujui belum dibayar</span>
              <strong>{formatCurrency(kpis.approvedUnpaidCosts)}</strong>
              <small>Proyek dan operasional perusahaan</small>
            </Link>
            <Link href="/finance" className="workspace-stat hover:bg-slate-50">
              <span className="text-sm text-slate-600">Pekerjaan finance terbuka</span>
              <strong>{kpis.openFinanceWork}</strong>
              <small>Butuh tindak lanjut atau prasyarat</small>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Angka hanya berasal dari transaksi dan dokumen yang sudah tercatat. Saldo kosong tidak berarti kas nol.</p>
        </section>
      )}
    </div>
  );
}
