import { TriangleAlert } from "lucide-react";
import { ProjectFlowOverview } from "@/components/projects/project-flow-overview";
import { ProjectQuickLinks } from "@/components/projects/project-quick-links";
import { ProjectSnapshotCard } from "@/components/projects/project-snapshot";
import type { ProjectCommandData } from "@/lib/project-command";

/**
 * Project Command Center.
 *
 * Satu layar yang menjawab tiga pertanyaan yang selama ini tersebar di
 * banyak tab: proyek ini sedang di mana, apa yang menahannya, dan ke modul
 * mana harus pergi untuk menindaklanjutinya.
 *
 * Halaman ini tidak menghitung apa pun sendiri dan tidak mengubah status.
 * Semua angka datang jadi dari lapisan data, supaya layar ini tidak pernah
 * bisa berbeda dari laporan.
 */

export function ProjectCommandCenter({ data }: { data: ProjectCommandData }) {
  const { snapshot, stages, quickLinks, attention } = data;

  return (
    <div className="space-y-4">
      {data.isMock && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Halaman ini masih memakai <strong>data tiruan</strong>. Angka dan nomor dokumen di
          bawah bukan data proyek yang sebenarnya — tampilannya dulu yang sedang diuji.
        </p>
      )}

      {/* Status & progres sekilas — ditaruh paling atas karena inilah yang
          ditanyakan lebih dulu sebelum orang tahu mau membuka modul mana. */}
      <ProjectSnapshotCard projectName={data.projectName} snapshot={snapshot} />

      {attention.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <TriangleAlert className="h-4 w-4" /> Yang menahan proyek ini
          </p>
          <ul className="ml-5 list-disc space-y-0.5 text-xs text-muted-foreground">
            {attention.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Ikhtisar alur proyek: Komersial → Pengadaan → Pelaksanaan → Kendali,
          urutan yang sama dengan jalannya pekerjaan yang sebenarnya. */}
      <ProjectFlowOverview stages={stages} />

      {/* Tautan cepat modul — semuanya menuju modul yang sudah ada, tidak
          ada layar baru yang perlu dipelajari ulang. */}
      <ProjectQuickLinks links={quickLinks} />
    </div>
  );
}
