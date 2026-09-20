import Link from "next/link";
import { ProjectCommandCenter } from "@/components/projects/command-center";
import { mockProjectCommand } from "@/lib/project-command";
import { requireUser } from "@/lib/auth/current-user";

/**
 * Rute Command Center per proyek.
 *
 * Tahap ini sengaja masih memakai mockProjectCommand(): bentuk layarnya perlu
 * diuji dengan diklik-klik lebih dulu sebelum kueri aslinya ditulis. Saat
 * tugas backend dikerjakan, satu baris mockProjectCommand() diganti pemanggil
 * data asli — komponen dan tipe di bawahnya tidak perlu berubah.
 */
export default async function ProjectCommandPage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();
  const data = mockProjectCommand(params.id);

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
