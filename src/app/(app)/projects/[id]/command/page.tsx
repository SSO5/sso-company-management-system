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
 *
 * Ini sekarang PINTU MASUK UTAMA sebuah proyek: src/app/(app)/projects/[id]/page.tsx
 * mengarahkan ke sini setiap kali URL kanonis dibuka tanpa tab tertentu.
 * Tautan "kembali" karena itu TIDAK BOLEH bare `/projects/${id}` — itu akan
 * langsung dipantulkan balik ke sini oleh redirect yang sama, jadi tautan di
 * bawah wajib menyebut tab eksplisit.
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
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/projects"
          className="inline-block py-2 text-sm text-primary"
        >
          ← Semua proyek
        </Link>
        <Link
          href={`/projects/${params.id}?tab=progress`}
          className="inline-block py-2 text-sm text-primary"
        >
          Buka tampilan detail lengkap (laporan mingguan, tugas, dokumen) →
        </Link>
      </div>
      <ProjectCommandCenter data={data} />
    </div>
  );
}
