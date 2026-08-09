import Link from "next/link";
import { globalSearch } from "@/server/search";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q ?? "";
  const results = await globalSearch(query);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Search Results</h1><p className="text-sm text-muted-foreground">&quot;{query}&quot; — {results.length} result(s)</p></div>
      {results.length === 0 ? (
        <EmptyState title="No results" description="Try a customer name, quotation number, project number, or invoice number." />
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
