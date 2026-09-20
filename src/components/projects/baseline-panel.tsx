import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  unmappedBaselineLines,
  type ProjectBaselineData,
} from "@/lib/project-baseline";
import { ActiveBaselineCard } from "@/components/projects/active-baseline-card";
import { SetBaselinePanel } from "@/components/projects/set-baseline-panel";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

/**
 * Panel Budget Baseline Proyek.
 *
 * Tiga hal yang ditampilkan berurutan, karena begitulah pertanyaannya datang:
 *
 *   1. BASELINE BERLAKU — angka beku mana yang sedang jadi pembanding, dari
 *      costing nomor berapa, dikunci oleh siapa.
 *   2. RINCIANNYA        — pagu per jenis biaya, yang nantinya dipasangkan
 *      dengan realisasi di papan biaya.
 *   3. RIWAYAT           — versi sebelumnya beserta alasan perubahannya.
 *
 * Selisih terhadap Project.budget ditampilkan menonjol. Dua angka pagu yang
 * berbeda tanpa ada yang menyebutkannya adalah cara termudah membuat orang
 * membaca laporan yang salah — papan biaya memakai Project.budget, sementara
 * orang mengira yang dipakai baseline.
 */
export function ProjectBaselinePanel({ data }: { data: ProjectBaselineData }) {
  const { current, history } = data;

  return (
    <div className="space-y-4">
      {data.isMock && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Halaman ini masih memakai <strong>data tiruan</strong>. Nomor costing dan
          angkanya bukan baseline proyek yang sebenarnya.
        </p>
      )}

      {!current ? (
        <EmptyState
          title="Proyek ini belum punya baseline"
          description="Tetapkan satu costing final sebagai baseline supaya papan biaya punya pembanding yang tidak ikut bergeser saat pagu proyek disesuaikan."
        />
      ) : (
        <>
          <ActiveBaselineCard
            current={current}
            projectBudget={data.projectBudget}
          />

          <BaselineLines current={current} />
        </>
      )}

      <SetBaselinePanel data={data} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Riwayat baseline</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Perubahan lingkup pekerjaan memang terjadi. Yang tidak boleh terjadi
            adalah perubahan itu menghapus jejak angka sebelumnya.
          </p>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {history.length === 0 ? (
            <p className="px-6 pb-2 text-xs text-muted-foreground sm:px-0">
              Belum ada versi baseline yang tercatat.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Versi</TableHead>
                    <TableHead>Costing</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                    <TableHead>Ditetapkan</TableHead>
                    <TableHead>Alasan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((v) => (
                    <TableRow
                      key={v.id}
                      className={cn(v.id !== current?.id && "opacity-70")}
                    >
                      <TableCell className="whitespace-nowrap">
                        v{v.version}
                        {v.id === current?.id && (
                          <Badge variant="default" className="ml-1.5">
                            berlaku
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {v.costingNumber}
                        {v.costingRevision > 0 ? `.R${v.costingRevision}` : ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(v.amount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {v.setBy}
                        <br />
                        {formatDateTime(v.setAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {v.reason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BaselineLines({
  current,
}: {
  current: NonNullable<ProjectBaselineData["current"]>;
}) {
  const belum = unmappedBaselineLines(current.lines);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pagu per jenis biaya</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Inilah yang dipasangkan dengan realisasi di papan biaya. Baris tanpa jenis
          biaya belum bisa dibandingkan.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-0 sm:px-6">
        {belum.length > 0 && (
          <p className="mx-6 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs sm:mx-0">
            <strong>{belum.length} baris</strong> belum punya jenis biaya. Selama
            masih begitu, papan biaya tetap menulis &ldquo;belum dipetakan&rdquo; pada
            kolom baseline untuk jenis biaya tersebut.
          </p>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uraian</TableHead>
                <TableHead>Jenis biaya</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead className="text-right">Pagu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{l.label}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {l.costTypeCode ? (
                      <span className="font-mono text-xs">{l.costTypeCode}</span>
                    ) : (
                      <Badge variant="warning">Belum dipetakan</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {displayLabel(l.category)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatCurrency(l.amount)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-medium">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatCurrency(current.amount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
