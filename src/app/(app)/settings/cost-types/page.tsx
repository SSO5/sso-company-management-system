import { CostTypeTable } from "@/components/settings/cost-type-table";
import { CostTypeFilterBar } from "@/components/settings/cost-type-filter-bar";
import { CostTypeFormDialog } from "@/components/settings/cost-type-form-dialog";
import {
  filterCostTypes,
  loadCostTypes,
  parseCostTypeFilter,
} from "@/lib/cost-type";
import { listChartOfAccounts } from "@/server/finance/chart-of-accounts";
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
export default async function CostTypesPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  await requireUser();
  const [types, accounts] = await Promise.all([
    loadCostTypes(),
    // Pilihan akun sudah diambil dari data NYATA walau daftar jenis biayanya
    // masih tiruan: memetakan ke akun karangan tidak akan menguji apa pun.
    listChartOfAccounts(),
  ]);
  // Penyaringan dikerjakan di server dari query URL, bukan di dalam tabel:
  // keadaannya jadi bertahan setelah halaman disegarkan dan bisa dikirim ke
  // orang lain apa adanya.
  const filter = parseCostTypeFilter(searchParams);
  const terlihat = filterCostTypes(types, filter);

  const accountOptions = accounts
    .filter((a) => a.isActive)
    .map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-xl font-semibold">Jenis Biaya Proyek</h1>
        <p className="text-sm text-muted-foreground">
          Daftar jenis biaya yang boleh dipilih saat mencatat pengeluaran proyek,
          beserta akun pembukuannya. Inilah yang menghubungkan costing final dengan
          biaya aktual, sehingga pagu per jenis biaya bisa dibandingkan.
        </p>
        </div>
        <CostTypeFormDialog accounts={accountOptions} />
      </div>

      <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
        Halaman ini masih memakai <strong>data tiruan</strong>. Kode dan akun di bawah
        bukan daftar yang sebenarnya — tampilannya dulu yang sedang diuji.
      </p>

      <CostTypeFilterBar />

      {terlihat.length === 0 && types.length > 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Tidak ada jenis biaya yang cocok dengan pencarian ini. Coba kata kunci lain
          atau bersihkan saringannya.
        </p>
      ) : (
        <CostTypeTable types={terlihat} accounts={accountOptions} />
      )}
    </div>
  );
}
