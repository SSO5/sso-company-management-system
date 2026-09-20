"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshCostBoardAction } from "@/app/(app)/projects/[id]/cost-board/actions";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Tombol dan penanda kesegaran papan biaya.
 *
 * Janji fiturnya adalah angka berubah begitu ada input baru. Yang membuat
 * janji itu bisa dipercaya bukan hanya penyegarannya, melainkan penanda
 * waktunya: tanpa itu, papan yang gagal menyegarkan terlihat persis sama
 * dengan papan yang baru saja disegarkan.
 *
 * Penyegaran otomatis sengaja tidak memakai polling berkala. Data papan ini
 * hanya berubah ketika seseorang menyimpan atau menyetujui biaya, dan itu
 * sudah ditangani revalidateCostBoard() dari sisi server. Yang tersisa di
 * sini adalah dua keadaan yang tidak terlihat server: tab yang ditinggal
 * lalu dibuka lagi, dan permintaan manual.
 */
export function CostBoardRefresh({
  projectId,
  updatedAt,
}: {
  projectId: string;
  updatedAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const res = await refreshCostBoardAction(projectId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  // Tab yang ditinggal lama lalu dibuka lagi adalah cara paling umum orang
  // menatap angka basi tanpa sadar. Server tidak bisa tahu itu terjadi.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        variant="outline"
        size="sm"
        onClick={refresh}
        disabled={pending}
        aria-label="Perbarui angka papan biaya"
      >
        <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", pending && "animate-spin")} />
        {pending ? "Memperbarui…" : "Perbarui"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Angka dihitung {formatDateTime(updatedAt)}
      </p>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
