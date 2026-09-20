import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectBaselinePanel } from "@/components/projects/baseline-panel";
import { getProjectBaseline } from "@/server/projects/baseline";
import { requireUser } from "@/lib/auth/current-user";

/**
 * Rute Budget Baseline Proyek.
 *
 * Membaca tabel ProjectBudgetBaseline yang sebenarnya. Pemeriksaan hak akses
 * ada di dalam getProjectBaseline(), bukan di sini.
 */
/* Angka realisasi bergerak setiap ada biaya disetujui. */
export const dynamic = "force-dynamic";

export default async function ProjectBaselinePage({
  params,
}: {
  params: { id: string };
}) {
  const actor = await requireUser();
  const data = await getProjectBaseline(params.id);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/cost-board`}
        className="inline-block py-2 text-sm text-primary"
      >
        ← Papan biaya
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Budget Baseline</h1>
        <p className="text-sm text-muted-foreground">
          Angka pagu yang dibekukan dari satu versi costing final. Berbeda dari pagu
          proyek yang bisa diubah kapan saja — baseline inilah yang membuat kalimat
          &ldquo;lewat pagu&rdquo; punya arti.
        </p>
      </div>
      <ProjectBaselinePanel data={data} role={actor.role} />
    </div>
  );
}
