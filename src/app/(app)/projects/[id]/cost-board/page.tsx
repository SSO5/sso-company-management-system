import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectCostBoard } from "@/components/projects/cost-board";
import { getProjectCostBoard } from "@/server/projects/cost-board";

/**
 * Rute Papan Biaya Proyek.
 *
 * Kini membaca data nyata lewat getProjectCostBoard(). Pemeriksaan hak akses
 * ada di dalam fungsi itu, bukan di sini, supaya tidak ada jalan masuk yang
 * melewatinya.
 */
/* Angka biaya tidak boleh datang dari cache statis: papan ini menjanjikan
   perubahan begitu ada input baru. */
export const dynamic = "force-dynamic";

export default async function ProjectCostBoardPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getProjectCostBoard(params.id);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/command`}
        className="inline-block py-2 text-sm text-primary"
      >
        ← Command Center
      </Link>
      <ProjectCostBoard data={data} />
    </div>
  );
}
