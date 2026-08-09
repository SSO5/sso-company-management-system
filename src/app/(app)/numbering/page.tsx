import { requireUser } from "@/lib/auth/current-user";
import { listNumberRegistryEntries } from "@/server/numbering/registry";
import { getCompanySettings } from "@/server/settings/company";
import { NumberRegistryPanel } from "@/components/numbering/number-registry-panel";
import { NumberingForm } from "@/components/settings/numbering-form";

/**
 * Everything numbering-related lives here, in one tab under Overview:
 * taking a number (anyone) and configuring prefixes/padding (Admin only).
 * There used to be a separate Settings > Numbering page — removed in favor
 * of this single source of truth.
 */
export default async function NumberingPage() {
  const actor = await requireUser();
  const [entries, settings] = await Promise.all([
    listNumberRegistryEntries(),
    actor.role === "ADMIN" ? getCompanySettings() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Numbering</h1>
        <p className="text-sm text-muted-foreground">Ambil nomor dokumen di sini sebelum membuat penawaran, job order, atau surat apa pun.</p>
      </div>
      <NumberRegistryPanel entries={entries} />

      {settings && (
        <div className="space-y-2 border-t border-border pt-6">
          <div>
            <h2 className="text-lg font-semibold">Pengaturan Prefix Nomor</h2>
            <p className="text-sm text-muted-foreground">Format: {"{urutan}/{prefix}/{bulan-romawi}/{tahun}"}, misal 004/QUO/MKT/VII/2026. Admin only.</p>
          </div>
          {/* Server -> Client Component props must be plain-serializable.
              CompanySettings carries a Prisma Decimal (defaultTaxRatePercent)
              and Date (updatedAt) field that NumberingForm never reads, but
              React still warns/chokes passing them raw — a JSON round-trip
              converts both to plain strings, which is all the form needs. */}
          <NumberingForm settings={JSON.parse(JSON.stringify(settings))} />
        </div>
      )}
    </div>
  );
}
