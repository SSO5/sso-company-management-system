"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  approveExpenseAction,
  rejectExpenseAction,
} from "@/server/projects/tasks";
import {
  decisionBlockedReason,
  rejectReasonProblem,
  type ReviewItem,
} from "@/lib/expense-review";
import { formatCurrency } from "@/lib/utils";

/**
 * Tombol Setujui dan Tolak pada panel tinjauan.
 *
 * Keduanya memanggil alur yang SUDAH ADA di lib/workflows/expense.ts —
 * bukan jalur baru. Itu penting: persetujuan biaya mengirim notifikasi,
 * menulis log, dan membuka jalan ke pembayaran. Menyalin alurnya untuk
 * halaman ini akan melahirkan dua jalan dengan akibat yang berbeda.
 *
 * Tombol yang mati SELALU menjelaskan dirinya. Tombol mati tanpa alasan
 * membuat orang mengira aplikasinya rusak, lalu mencari jalan lain.
 *
 * Menolak menuntut alasan yang bisa ditindak. Penolakan tanpa itu akan
 * kembali lagi dalam bentuk yang sama minggu depan — pengajunya tidak punya
 * cara tahu apa yang harus diperbaiki.
 */
export function ExpenseDecisionActions({
  item,
  actor,
  onDone,
}: {
  item: ReviewItem;
  actor: { role: string; userId: string };
  onDone?: () => void;
}) {
  const [menolak, setMenolak] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const terhalang = decisionBlockedReason(item, actor);
  const masalahAlasan = rejectReasonProblem(reason);

  if (terhalang) {
    return <p className="text-[11px] text-muted-foreground">{terhalang}</p>;
  }

  async function jalankan(fn: () => Promise<{ ok: boolean; error?: string }>, judul: string) {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (res.ok) {
      toast({ title: judul, variant: "success" });
      setMenolak(false);
      setReason("");
      onDone?.();
      router.refresh();
    } else {
      toast({ title: "Gagal", description: res.error, variant: "destructive" });
    }
  }

  if (menolak) {
    return (
      <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs">
          Menolak {formatCurrency(item.total)} yang diajukan {item.submittedBy}.
          Alasannya dikirim ke pengaju dan tercatat di riwayat.
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Apa yang harus diperbaiki sebelum diajukan lagi."
          aria-label="Alasan penolakan"
        />
        {reason.length > 0 && masalahAlasan && (
          <p className="text-[11px] text-destructive">{masalahAlasan}</p>
        )}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || masalahAlasan !== null}
            onClick={() =>
              jalankan(
                () => rejectExpenseAction(item.id, item.projectId, reason.trim()),
                "Biaya ditolak",
              )
            }
          >
            {pending ? "Menyimpan…" : "Tolak biaya ini"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setMenolak(false);
              setReason("");
            }}
          >
            Batal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          jalankan(
            () => approveExpenseAction(item.id, item.projectId),
            "Biaya disetujui",
          )
        }
      >
        <Check className="mr-1.5 h-3.5 w-3.5" />
        {pending ? "Menyimpan…" : `Setujui ${formatCurrency(item.total)}`}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setMenolak(true)}
      >
        <X className="mr-1.5 h-3.5 w-3.5" /> Tolak
      </Button>
    </div>
  );
}
