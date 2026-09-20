"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { saveExpenseCorrectionAction } from "@/server/finance/expense-correction";
import {
  correctionChanges,
  correctionFrom,
  correctionProblems,
  decisionBlockedReason,
  type CorrectionValues,
  type ReviewItem,
} from "@/lib/expense-review";
import { formatCurrency } from "@/lib/utils";

/**
 * Koreksi detail draf sebelum disetujui.
 *
 * Mengoreksi biaya yang sudah diajukan berarti mengubah angka yang bukan
 * milik Anda: pengajunya mencatat satu hal, dan yang tersimpan menjadi hal
 * lain. Karena itu tiga hal dipegang di sini:
 *
 *   1. YANG BOLEH MENGOREKSI SAMA DENGAN YANG BOLEH MEMUTUSKAN. Mengizinkan
 *      orang lain mengubah angka lalu menyerahkannya ke Admin untuk
 *      disetujui akan membuat maker-checker kehilangan artinya.
 *   2. PERUBAHANNYA DITAMPILKAN sebelum disimpan, dari berapa ke berapa.
 *   3. CATATAN WAJIB. Itu satu-satunya cara pengajunya tahu apa yang terjadi
 *      tanpa harus bertanya.
 */
export function ExpenseCorrectionForm({
  item,
  actor,
}: {
  item: ReviewItem;
  actor: { role: string; userId: string };
}) {
  const [buka, setBuka] = useState(false);
  const [values, setValues] = useState<CorrectionValues>(() =>
    correctionFrom(item),
  );
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const terhalang = decisionBlockedReason(item, actor);
  if (terhalang) return null;

  const changes = correctionChanges(item, values);
  const problems = correctionProblems(item, values, note, actor);
  const set = <K extends keyof CorrectionValues>(k: K, v: CorrectionValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  if (!buka) {
    return (
      <Button size="sm" variant="outline" onClick={() => setBuka(true)}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Koreksi dulu
      </Button>
    );
  }

  async function simpan() {
    setPending(true);
    const res = await saveExpenseCorrectionAction(
      item.id,
      item.submittedById,
      values,
      note,
    );
    setPending(false);
    if (res.ok) {
      toast({ title: "Koreksi tersimpan", variant: "success" });
      setBuka(false);
      router.refresh();
    } else {
      toast({ title: "Belum tersimpan", description: res.error, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">
        Mengubah biaya yang diajukan {item.submittedBy}. Perubahannya tercatat
        beserta catatan Anda.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Keterangan</Label>
          <Input
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Vendor</Label>
          <Input
            value={values.vendor}
            onChange={(e) => set("vendor", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Tanggal</Label>
          <Input
            type="date"
            value={values.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Nilai sebelum pajak (Rp)</Label>
          <Input
            type="number"
            min={0}
            value={values.amount}
            onChange={(e) => set("amount", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label>Pajak (Rp)</Label>
          <Input
            type="number"
            min={0}
            value={values.tax}
            onChange={(e) => set("tax", Number(e.target.value))}
          />
        </div>
      </div>

      <p className="text-xs">
        Total setelah koreksi:{" "}
        <strong className="tabular-nums">
          {formatCurrency(values.amount + values.tax)}
        </strong>{" "}
        <span className="text-muted-foreground">
          (sebelumnya {formatCurrency(item.total)})
        </span>
      </p>

      {/* Ditampilkan sebelum disimpan, bukan sesudah. */}
      {changes.length > 0 && (
        <ul className="space-y-1">
          {changes.map((c) => (
            <li
              key={c.field}
              className="flex flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"
            >
              <span className="text-muted-foreground">{c.label}:</span>
              <span className="text-muted-foreground line-through">{c.before}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{c.after}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1">
        <Label>Catatan koreksi</Label>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Apa yang Anda perbaiki dan kenapa."
        />
      </div>

      {problems.length > 0 && changes.length > 0 && (
        <ul className="space-y-1 text-[11px] text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-1.5">
        <Button size="sm" disabled={pending || problems.length > 0} onClick={simpan}>
          {pending ? "Menyimpan…" : "Simpan koreksi"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setBuka(false);
            setValues(correctionFrom(item));
            setNote("");
          }}
        >
          Batal
        </Button>
      </div>
    </div>
  );
}
