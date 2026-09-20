import { CostTypeTable } from "@/components/settings/cost-type-table";
import { loadCostTypes } from "@/lib/cost-type";
import { requireUser } from "@/lib/auth/current-user";

/**
 * Pengaturan > Jenis Biaya Proyek.
 *
 * Ditaruh di Pengaturan, bukan di ruang proyek, karena daftar ini milik
 * perusahaan: satu jenis biaya dipakai oleh semua proyek, dan mengubahnya
 * dari dalam satu proyek akan menyesatkan.
 *
 * Masih memakai data tiruan; saat tabelnya ada, hanya isi loadCostTypes()
 * yang berubah.
 */
export default async function CostTypesPage() {
  await requireUser();
  const types = await loadCostTypes();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Jenis Biaya Proyek</h1>
        <p className="text-sm text-muted-foreground">
          Daftar jenis biaya yang boleh dipilih saat mencatat pengeluaran proyek,
          beserta akun pembukuannya. Inilah yang menghubungkan costing final dengan
          biaya aktual, sehingga pagu per jenis biaya bisa dibandingkan.
        </p>
      </div>

      <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
        Halaman ini masih memakai <strong>data tiruan</strong>. Kode dan akun di bawah
        bukan daftar yang sebenarnya — tampilannya dulu yang sedang diuji.
      </p>

      <CostTypeTable types={types} />
    </div>
  );
}
