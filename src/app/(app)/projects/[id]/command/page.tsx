import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectCommandCenter } from "@/components/projects/command-center";
import { getProjectCommandSummary } from "@/server/projects/command-center";

/**
 * Rute Command Center per proyek.
 *
 * Kini membaca data nyata lewat getProjectCommandSummary(). Kontrak tipenya
 * tidak berubah sejak tahap tiruan, jadi tidak ada satu pun komponen yang
 * perlu disentuh — persis itu gunanya menulis tipenya lebih dulu.
 *
 * Pemeriksaan hak akses ada di dalam getProjectCommandSummary(), bukan di
 * sini, supaya tidak ada jalan masuk yang melewatinya.
 */
export const dynamic = "force-dynamic";

export default async function ProjectCommandPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getProjectCommandSummary(params.id);
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
