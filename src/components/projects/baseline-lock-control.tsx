"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  lockProjectBaselineAction,
  unlockProjectBaselineAction,
} from "@/server/projects/baseline";
import {
  canUnlockBaseline,
  isLocked,
  validateUnlockBaseline,
  type BaselineVersion,
} from "@/lib/project-baseline";

/**
 * Kontrol kunci dan buka kunci baseline.
 *
 * Dua tombol dengan berat yang sangat berbeda, dan tampilannya mengakui itu:
 *
 *   MENGUNCI   — satu klik. Ia membuat angka lebih sulit digeser, bukan
 *                lebih mudah, jadi tidak perlu ditanya dua kali.
 *   BUKA KUNCI — hanya Admin, wajib beralasan. Ia mengizinkan angka
 *                pembanding diubah TANPA versi baru, yang berarti laporan
 *                bulan lalu bisa berubah arti tanpa jejak.
 *
 * Bagi yang bukan Admin, tombol buka kunci tidak disembunyikan diam-diam.
 * Keterangannya ditampilkan beserta jalan yang seharusnya ditempuh —
 * menetapkan baseline versi baru, yang justru meninggalkan jejak.
 */
export function BaselineLockControl({
  baseline,
  role,
}: {
  baseline: BaselineVersion;
  role: string;
}) {
  const [pending, setPending] = useState(false);
  const [membuka, setMembuka] = useState(false);
  const [reason, setReason] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  const terkunci = isLocked(baseline);
  const bolehBuka = canUnlockBaseline(role);
  const masalah = validateUnlockBaseline({ role, reason });

  async function jalankan(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    const res = (await fn()) as { ok: boolean; error?: string };
    setPending(false);
    if (res.ok) {
      toast({
        title: terkunci ? "Kunci baseline dibuka" : "Baseline dikunci",
        variant: "success",
      });
      setMembuka(false);
      setReason("");
      router.refresh();
    } else {
      toast({
        title: "Belum tersimpan",
        description: res.error,
        variant: "destructive",
      });
    }
  }

  if (!terkunci) {
    return (
      <div className="space-y-1">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => jalankan(() => lockProjectBaselineAction(baseline.id))}
        >
          <Lock className="mr-1.5 h-3.5 w-3.5" />
          {pending ? "Mengunci…" : "Kunci baseline"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Setelah dikunci, angkanya hanya bisa diganti dengan menetapkan baseline
          versi baru.
        </p>
      </div>
    );
  }

  if (!bolehBuka) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Baseline ini terkunci. Hanya Admin yang bisa membukanya — untuk mengubah
        angka pembanding, tetapkan baseline versi baru. Cara itu meninggalkan jejak
        beserta alasannya.
      </p>
    );
  }

  if (!membuka) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setMembuka(true)}
      >
        <Unlock className="mr-1.5 h-3.5 w-3.5" /> Buka kunci
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs">
        Membuka kunci mengizinkan angka pembanding diubah <strong>tanpa</strong>{" "}
        menambah versi baru. Laporan yang sudah terbit bisa berubah arti tanpa jejak.
        Kalau yang Anda butuhkan adalah angka baru, tetapkan baseline versi baru saja.
      </p>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Alasan membuka kunci — akan tercatat."
        aria-label="Alasan membuka kunci baseline"
      />
      {masalah && reason.length > 0 && (
        <p className="text-[11px] text-destructive">{masalah}</p>
      )}
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || masalah !== null}
          onClick={() =>
            jalankan(() => unlockProjectBaselineAction(baseline.id, reason))
          }
        >
          {pending ? "Menyimpan…" : "Ya, buka kunci"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setMembuka(false);
            setReason("");
          }}
        >
          Batal
        </Button>
      </div>
    </div>
  );
}
