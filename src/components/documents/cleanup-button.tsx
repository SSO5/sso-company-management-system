"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cleanExactDuplicates } from "@/server/documents/cleanup";
export function CleanupButton({ ids }: { ids: string[] }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <div className="border-t p-4">
      <Button
        disabled={busy}
        variant="outline"
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const result = await cleanExactDuplicates(ids);
            setMessage(
              result.ok
                ? `${result.data.removed} duplikat identik dipindahkan ke Sampah. File bukti, versi laporan, dan dokumen transaksi dipertahankan.`
                : result.error,
            );
            if (result.ok) router.refresh();
          } catch {
            setMessage("Pemeriksaan belum selesai. Coba lagi.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Membandingkan isi file…"
          : "Bersihkan salinan identik yang tidak terpakai"}
      </Button>
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        {message ||
          "Isi file diperiksa sebelum dihapus dari daftar aktif. Salinan tersimpan dapat dipulihkan."}
      </p>
    </div>
  );
}
