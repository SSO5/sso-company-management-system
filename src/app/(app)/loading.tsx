import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level pending UI for every (app) page. Without this, navigation
 * between server-rendered pages shows nothing at all — the previous page
 * freezes until the new one is ready, which reads as "the app hung". A
 * skeleton that mirrors the real page shape (title bar + cards/table) makes
 * the wait feel short and confirms the tap registered.
 */
export default function AppLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat halaman">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="rounded-md border border-border">
        <Skeleton className="h-9 w-full rounded-b-none" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none border-t border-border" />
        ))}
      </div>
    </div>
  );
}
