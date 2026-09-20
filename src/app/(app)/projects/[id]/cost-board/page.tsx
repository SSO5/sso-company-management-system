import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectCostBoard } from "@/components/projects/cost-board";
import { loadCostBoard } from "@/lib/project-cost-board";
import { requireUser } from "@/lib/auth/current-user";

/**
 * Rute Papan Biaya Proyek.
 *
 * Masih memakai data tiruan; saat kueri aslinya ditulis, hanya isi
 * loadCostBoard() yang berubah. Proyek yang tidak ada ditangani sejak
 * sekarang supaya alamat yang salah tidak pernah menampilkan angka tiruan
 * seolah-olah itu biaya proyek yang sebenarnya.
 */
/* Angka biaya tidak boleh datang dari cache statis: papan ini menjanjikan
   perubahan begitu ada input baru. */
export const dynamic = "force-dynamic";

export default async function ProjectCostBoardPage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();
  const data = await loadCostBoard(params.id);
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
