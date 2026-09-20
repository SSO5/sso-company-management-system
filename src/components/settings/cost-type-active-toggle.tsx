"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setCostTypeActiveAction } from "@/server/settings/cost-types";
import { canDeleteCostType, type CostType } from "@/lib/cost-type";

/**
 * Saklar aktif/nonaktif langsung dari baris daftar.
 *
 * Ada di daftar, bukan hanya di dalam form, karena merapikan daftar master
 * adalah pekerjaan sambil lalu: memaksa orang membuka form untuk mematikan
 * satu baris membuat daftar yang sudah usang dibiarkan begitu saja.
 *
 * Menonaktifkan BUKAN menghapus, dan itu dikatakan sebelum ditekan — bukan
 * sesudah. Jenis yang sudah dipakai biaya lama tetap memegang riwayatnya;
 * yang berubah hanya bahwa ia tidak lagi ditawarkan saat mencatat biaya
 * baru. Karena tidak bisa dibatalkan lewat tombol hapus (tombol itu memang
 * tidak ada untuk jenis terpakai), penonaktifan diminta konfirmasi sekali.
 */
export function CostTypeActiveToggle({ costType }: { costType: CostType }) {
  const [pending, setPending] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const akanDinonaktifkan = costType.isActive;
  const terpakai = !canDeleteCostType(costType);

  async function ubah() {
    setPending(true);
    const res = await setCostTypeActiveAction(costType.id, !costType.isActive);
    setPending(false);
    setKonfirmasi(false);
    if (res.ok) {
      toast({
        title: akanDinonaktifkan ? "Jenis biaya dinonaktifkan" : "Jenis biaya diaktifkan",
        variant: "success",
      });
      router.refresh();
    } else {
      toast({ title: "Belum tersimpan", description: res.error, variant: "destructive" });
    }
  }

  // Mengaktifkan kembali tidak merusak apa pun, jadi tidak perlu ditanya.
  if (!akanDinonaktifkan) {
    return (
      <Button size="sm" variant="outline" onClick={ubah} disabled={pending}>
        {pending ? "…" : "Aktifkan"}
      </Button>
    );
  }

  if (!konfirmasi) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setKonfirmasi(true)}
        disabled={pending}
      >
        Nonaktifkan
      </Button>
    );
  }

  return (
    <div className="space-y-1.5 text-left">
      <p className="text-[11px] text-muted-foreground">
        {terpakai
          ? `${costType.code} sudah dipakai ${costType.usageCount} biaya. Riwayatnya tetap utuh; jenis ini hanya berhenti ditawarkan saat mencatat biaya baru.`
          : `${costType.code} berhenti ditawarkan saat mencatat biaya baru.`}
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" variant="destructive" onClick={ubah} disabled={pending}>
          {pending ? "Menyimpan…" : "Ya, nonaktifkan"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setKonfirmasi(false)}
          disabled={pending}
        >
          Batal
        </Button>
      </div>
    </div>
  );
}
