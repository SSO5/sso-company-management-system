"use client";
import { Button } from "@/components/ui/button";

/**
 * App-level error boundary. The Next.js default for a segment without an
 * error.tsx is the bare red call-stack screen — unusable for non-technical
 * staff and a dead end (no way forward). This keeps the user inside the
 * shell, says what happened in plain language, and offers a retry plus a way
 * back to the dashboard.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-destructive/30 bg-card py-16 text-center">
      <div>
        <h1 className="text-lg font-semibold">Terjadi kesalahan</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Halaman ini gagal dimuat. Coba lagi — jika berulang, catat waktu kejadiannya
          dan hubungi administrator.
        </p>
      </div>
      {process.env.NODE_ENV === "development" && (
        <pre className="max-w-full overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
      )}
      <div className="flex gap-2">
        <Button onClick={reset}>Coba lagi</Button>
        <a href="/dashboard"><Button variant="outline">Ke Dashboard</Button></a>
      </div>
    </div>
  );
}
