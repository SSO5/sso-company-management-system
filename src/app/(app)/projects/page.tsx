import Link from "next/link";
import { listProjects } from "@/server/projects/projects";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
const labels: Record<string, string> = {
  PLANNING: "Persiapan",
  ACTIVE: "Aktif",
  AT_RISK: "Perlu perhatian",
  ON_HOLD: "Ditunda",
  COMPLETED: "Selesai",
  CLOSED: "Ditutup",
  CANCELLED: "Dibatalkan",
};
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const all = await listProjects();
  const q = (searchParams.q ?? "").toLowerCase();
  const status = searchParams.status ?? "active";
  const projects = all.filter(
    (p) =>
      (status === "all" ||
        (status === "active"
          ? ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"].includes(p.status)
          : p.status === status)) &&
      `${p.number} ${p.name} ${p.customer.companyName}`
        .toLowerCase()
        .includes(q),
  );
  return (
    <div className="space-y-5">
      <div className="workspace-heading">
        <div>
          <p className="workspace-eyebrow">Pelaksanaan & penyelesaian</p>
          <h1>Ruang proyek</h1>
          <p className="workspace-muted mt-2">
            Buka satu ruang untuk melihat tahapan, laporan lapangan, dokumen,
            dan biaya.
          </p>
        </div>
        <Link href="/data" className="text-sm text-primary">
          Data & Dokumen →
        </Link>
      </div>
      <form className="flex flex-wrap gap-3">
        <input
          name="q"
          aria-label="Cari proyek"
          defaultValue={searchParams.q}
          placeholder="Cari nama, nomor, atau pelanggan…"
          className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"
        />
        <select
          aria-label="Status proyek"
          name="status"
          defaultValue={status}
          className="rounded-xl border px-3 text-sm"
        >
          <option value="active">Proyek berjalan</option>
          <option value="all">Semua proyek</option>
          <option value="COMPLETED">Selesai</option>
          <option value="CLOSED">Ditutup</option>
        </select>
        <button className="rounded-xl bg-primary px-5 py-3 text-sm text-white">
          Tampilkan
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        {projects.length} proyek ditampilkan dari {all.length}. Proyek terbentuk
        ketika penawaran dimenangkan.
      </p>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <Link
            href={`/projects/${p.id}`}
            key={p.id}
            className="rounded-2xl border p-5 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="workspace-pill">
                {labels[p.status] ?? p.status}
              </span>
              <ArrowUpRight size={18} className="text-primary" />
            </div>
            <p className="mt-5 text-xs text-muted-foreground">{p.number}</p>
            <h2 className="mt-2 break-words text-lg font-semibold">{p.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {p.customer.companyName}
            </p>
            <div className="mt-5 border-t pt-4 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Penanggung jawab</span>
                <b>{p.projectManager?.name ?? "Belum ditentukan"}</b>
              </div>
              <div className="mt-3 flex flex-wrap justify-between gap-2">
                <span className="text-muted-foreground">Nilai kontrak</span>
                <b>{formatCurrency(Number(p.contractValue))}</b>
              </div>
              <p className="mt-3 text-muted-foreground">
                Diperbarui {formatDate(p.updatedAt)}
              </p>
            </div>
            {p.riskSignals.length > 0 && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                {p.riskSignals[0].message}
                {p.riskSignals.length > 1
                  ? ` · +${p.riskSignals.length - 1} perhatian lainnya`
                  : ""}
              </p>
            )}
          </Link>
        ))}
      </div>
      {projects.length === 0 && (
        <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          Tidak ada proyek yang sesuai filter.
        </p>
      )}
    </div>
  );
}
