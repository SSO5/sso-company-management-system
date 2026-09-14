import Link from "next/link";
import { globalSearch } from "@/server/search";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q ?? "";
  const results = await globalSearch(query);

  return (
    <div className="space-y-4">
      <div><p className="workspace-eyebrow">Pencarian seluruh ruang</p><h1 className="text-xl font-semibold">Hasil pencarian</h1><p className="text-sm text-muted-foreground">&quot;{query}&quot; — {results.length} hasil</p></div>
      {results.length === 0 ? (
        <EmptyState title="Data belum ditemukan" description="Coba nama pelanggan, nomor penawaran, nomor proyek, atau nomor invoice." />
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <Link key={`${r.type}-${r.id}`} href={r.href} className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-accent">
              <span className="text-sm">{r.label}</span>
              <Badge variant="outline">{r.type}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
