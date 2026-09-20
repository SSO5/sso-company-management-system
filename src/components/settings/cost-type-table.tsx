import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { displayLabel } from "@/lib/display-labels";
import { unmappedCostTypes, type CostType } from "@/lib/cost-type";
import { cn } from "@/lib/utils";

/**
 * Daftar Master Jenis Biaya.
 *
 * Kolom "Akun" adalah alasan halaman ini ada. Selama sebuah jenis biaya
 * belum punya akun, biayanya tidak bisa masuk pembukuan dan pagunya tidak
 * bisa dibandingkan — jadi yang belum dipetakan ditaruh di ATAS, bukan
 * diurutkan menurut kode dan terkubur di tengah daftar.
 *
 * Kolom "Dipakai" bukan hiasan: jumlah itulah yang menentukan sebuah jenis
 * boleh dihapus atau hanya boleh dinonaktifkan.
 */
export function CostTypeTable({ types }: { types: CostType[] }) {
  if (types.length === 0) {
    return (
      <EmptyState
        title="Belum ada jenis biaya"
        description="Buat jenis biaya pertama untuk mulai memetakan pengeluaran proyek ke bagan akun."
      />
    );
  }

  const belumDipetakan = unmappedCostTypes(types);

  return (
    <div className="space-y-3">
      {belumDipetakan.length > 0 && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          <strong>{belumDipetakan.length} jenis biaya</strong> belum dipetakan ke bagan
          akun: {belumDipetakan.map((t) => t.code).join(", ")}. Biaya dengan jenis ini
          tetap tercatat, tapi belum bisa masuk pembukuan dan belum punya pagu
          pembanding di papan biaya.
        </p>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Kelompok</TableHead>
              <TableHead>Akun</TableHead>
              <TableHead className="text-right">Dipakai</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((t) => (
              <TableRow key={t.id} className={cn(!t.isActive && "opacity-60")}>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {t.code}
                </TableCell>
                <TableCell>
                  <p className="text-sm">{t.name}</p>
                  {t.description && (
                    <p className="text-[11px] text-muted-foreground">{t.description}</p>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {displayLabel(t.category)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {t.accountCode ? (
                    <>
                      <span className="font-mono text-xs">{t.accountCode}</span>
                      <p className="text-[11px] text-muted-foreground">{t.accountName}</p>
                    </>
                  ) : (
                    <Badge variant="warning">Belum dipetakan</Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {t.usageCount > 0 ? (
                    <span>{t.usageCount} biaya</span>
                  ) : (
                    <span className="text-muted-foreground">belum dipakai</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={t.isActive ? "success" : "secondary"}>
                    {t.isActive ? "Aktif" : "Nonaktif"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Jenis biaya yang sudah dipakai tidak bisa dihapus, hanya dinonaktifkan —
        biaya lama tidak boleh kehilangan pengelompokannya hanya karena daftar ini
        dirapikan. Jenis nonaktif tidak muncul lagi saat mencatat biaya baru.
      </p>
    </div>
  );
}
