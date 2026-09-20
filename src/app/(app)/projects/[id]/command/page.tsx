import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectCommandCenter } from "@/components/projects/command-center";
import { loadProjectCommand } from "@/lib/project-command";
import { requireUser } from "@/lib/auth/current-user";

/**
 * Rute Command Center per proyek.
 *
 * Tahap ini sengaja masih memakai data tiruan: bentuk layarnya perlu diuji
 * dengan diklik-klik lebih dulu sebelum kueri aslinya ditulis. Saat tugas
 * backend dikerjakan, hanya isi loadProjectCommand() yang berubah — halaman,
 * komponen, dan tipe di bawahnya tidak perlu ikut berubah.
 *
 * Proyek yang tidak ada ditangani sejak sekarang, bukan nanti: tanpa ini,
 * alamat proyek yang salah akan menampilkan layar penuh angka tiruan seolah
 * itu data nyata.
 */
export default async function ProjectCommandPage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();
  const data = await loadProjectCommand(params.id);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}`}
        className="inline-block py-2 text-sm text-primary"
      >
        ← Detail proyek
      </Link>
      <ProjectCommandCenter data={data} />
    </div>
  );
}
