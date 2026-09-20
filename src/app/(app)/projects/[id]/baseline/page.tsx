import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectBaselinePanel } from "@/components/projects/baseline-panel";
import { loadProjectBaseline } from "@/lib/project-baseline";
import { requireUser } from "@/lib/auth/current-user";

/**
 * Rute Budget Baseline Proyek.
 *
 * Masih memakai data tiruan; saat tabelnya ada, hanya isi
 * loadProjectBaseline() yang berubah.
 */
export default async function ProjectBaselinePage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();
  const data = await loadProjectBaseline(params.id);
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
      <ProjectBaselinePanel data={data} />
    </div>
  );
}
