"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { checkStorageHealth, type StorageHealth } from "@/server/settings/storage-health";
import { CheckCircle2, XCircle, AlertTriangle, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

const VERDICT = {
  ok: { icon: CheckCircle2, label: "Aman", className: "border-success/30 bg-success/10 text-success" },
  will_lose_files: { icon: AlertTriangle, label: "File akan hilang", className: "border-warning/40 bg-warning/10 text-warning" },
  misconfigured: { icon: XCircle, label: "Belum berfungsi", className: "border-destructive/30 bg-destructive/10 text-destructive" },
} as const;

export function StorageHealthCard() {
  const [result, setResult] = useState<StorageHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    const res = await checkStorageHealth();
    setPending(false);
    if (res.ok) setResult(res.data);
    else setError(res.error);
  }

  const v = result ? VERDICT[result.verdict] : null;
  const Icon = v?.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4" /> Uji Penyimpanan</CardTitle>
        <Button size="sm" onClick={run} disabled={pending}>
          {pending ? "Menguji..." : result ? "Uji ulang" : "Jalankan uji"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Uji ini menulis satu file kecil, membacanya kembali, lalu menghapusnya — lewat jalur kode yang sama
          dengan unggahan biasa. Ini satu-satunya cara memastikan penyimpanan benar-benar bekerja, karena
          nilai <code className="rounded bg-muted px-1 text-xs">STORAGE_DRIVER</code> di Vercel tidak bisa
          dibaca kembali setelah ditandai Sensitive.
        </p>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        {result && v && Icon && (
          <>
            <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", v.className)}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{v.label}</p>
                <p className="opacity-90">{result.advice}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">Driver aktif</p>
                <p className="font-mono font-medium">{result.driver}</p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">Uji tulis &amp; baca</p>
                <p className="font-medium">{result.roundTripOk ? "Berhasil" : "Gagal"}</p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Variabel lingkungan — hanya ditampilkan ada atau tidak, nilainya tidak pernah ditampilkan
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(result.envPresent).map(([k, present]) => (
                  <Badge key={k} variant={present ? "success" : "outline"} className="font-mono text-[10px]">
                    {k} {present ? "✓" : "—"}
                  </Badge>
                ))}
              </div>
            </div>

            {result.error && (
              <div className="rounded-lg border border-border bg-muted px-3 py-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Detail error</p>
                <p className="break-words font-mono text-xs">{result.error}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{result.documentCount} dokumen tercatat di database saat ini.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
