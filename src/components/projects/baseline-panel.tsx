import { Lock, Unlock } from "lucide-react";
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
  budgetDrift,
  isLocked,
  unmappedBaselineLines,
  type ProjectBaselineData,
} from "@/lib/project-baseline";
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
  const drift = budgetDrift(data);

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
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">Baseline berlaku</CardTitle>
                <Badge variant="secondary">Versi {current.version}</Badge>
                {isLocked(current) ? (
                  <Badge variant="success">
                    <Lock className="mr-1 h-3 w-3" /> Terkunci
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <Unlock className="mr-1 h-3 w-3" /> Belum dikunci
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dari costing {current.costingNumber}
                {current.costingRevision > 0 ? `.R${current.costingRevision}` : ""} ·
                ditetapkan {current.setBy} pada {formatDateTime(current.setAt)}
                {current.lockedAt
                  ? ` · dikunci ${formatDateTime(current.lockedAt)}`
                  : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
                <Figure label="Baseline" value={formatCurrency(current.amount)} />
                <Figure
                  label="Pagu proyek saat ini"
                  value={formatCurrency(data.projectBudget)}
                />
                <Figure
                  label={
                    drift === null
                      ? "Selisih"
                      : drift === 0
                        ? "Sama dengan baseline"
                        : drift > 0
                          ? "Pagu proyek di atas baseline"
                          : "Pagu proyek di bawah baseline"
                  }
                  value={drift === null ? "—" : formatCurrency(Math.abs(drift))}
                  tone={drift && drift !== 0 ? "bad" : "good"}
                />
              </div>

              {drift !== null && drift !== 0 && (
                <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
                  Pagu proyek sudah bergeser {formatCurrency(Math.abs(drift))} dari
                  baseline. Papan biaya membandingkan realisasi dengan{" "}
                  <strong>pagu proyek</strong>, bukan baseline — jadi selisih ini ikut
                  menentukan apakah proyek terlihat aman atau tidak.
                </p>
              )}

              {current.reason && (
                <p className="text-xs text-muted-foreground">
                  Alasan versi ini: {current.reason}
                </p>
              )}
            </CardContent>
          </Card>

          <BaselineLines current={current} />
        </>
      )}

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

function Figure({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "break-words text-base font-semibold tabular-nums sm:text-lg",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
