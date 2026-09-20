"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { setProjectBaselineAction } from "@/server/projects/baseline";
import { displayLabel } from "@/lib/display-labels";
import {
  canBecomeBaseline,
  reasonRequired,
  SET_BASELINE_MESSAGE,
  validateSetBaseline,
  type ProjectBaselineData,
} from "@/lib/project-baseline";
import { formatCurrency } from "@/lib/utils";

/**
 * Panel penetapan costing final sebagai baseline.
 *
 * Tiga hal yang ditolak panel ini sebelum apa pun dikirim:
 *
 *   - Costing DRAFT. Ia masih bisa berubah malam ini juga, dan membekukan
 *     angka yang masih bergerak sama saja dengan tidak membekukan apa pun.
 *     Tetap DITAMPILKAN, tapi tidak bisa dipilih, supaya orang tahu costing
 *     itu ada dan mengerti kenapa belum bisa dipakai.
 *   - Costing yang sudah jadi baseline berlaku. Menetapkannya ulang hanya
 *     menambah versi tanpa mengubah angka.
 *   - Penggantian tanpa alasan. Versi pertama tidak perlu alasan; mulai versi
 *     kedua wajib, karena baseline yang berganti tanpa keterangan menghapus
 *     satu-satunya penjelasan kenapa angka pembandingnya bergeser.
 *
 * Selisih terhadap baseline berlaku dihitung dan ditampilkan SEBELUM tombol
 * ditekan. Baseline yang berubah diam-diam sebesar seratus juta adalah hal
 * yang seharusnya terlihat saat memilih, bukan setelah tersimpan.
 */
export function SetBaselinePanel({ data }: { data: ProjectBaselineData }) {
  const [costingNumber, setCostingNumber] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const dipilih =
    data.availableCostings.find((c) => c.number === costingNumber) ?? null;
  const problems = validateSetBaseline({
    costing: dipilih,
    reason,
    current: data.current,
  });
  const wajibAlasan = reasonRequired(data.current);
  const selisih =
    dipilih && data.current ? dipilih.amount - data.current.amount : null;

  async function submit() {
    setPending(true);
    const res = await setProjectBaselineAction(data.projectId, {
      costingNumber,
      reason,
    });
    setPending(false);
    if (res.ok) {
      toast({ title: "Baseline ditetapkan", variant: "success" });
      setCostingNumber("");
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {data.current ? "Ganti baseline" : "Tetapkan baseline"}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Angka costing yang dipilih akan dibekukan sebagai pembanding. Versi
          sebelumnya tidak dihapus, hanya berhenti berlaku.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label>Costing sumber</Label>
          <Select
            value={costingNumber}
            onChange={(e) => setCostingNumber(e.target.value)}
            aria-label="Pilih costing sumber baseline"
          >
            <option value="">— Pilih costing —</option>
            {data.availableCostings.map((c) => {
              const bisa = canBecomeBaseline(c);
              return (
                <option key={c.number} value={c.number} disabled={!bisa}>
                  {c.number}
                  {c.revision > 0 ? `.R${c.revision}` : ""} ·{" "}
                  {formatCurrency(c.amount)} · {displayLabel(c.status)}
                  {bisa ? "" : " (belum bisa dipakai)"}
                </option>
              );
            })}
          </Select>
          {data.availableCostings.every((c) => !canBecomeBaseline(c)) && (
            <p className="text-[11px] text-warning">
              Belum ada costing berstatus final pada proyek ini. Selesaikan dulu satu
              costing sebelum baseline bisa ditetapkan.
            </p>
          )}
        </div>

        {/* Dampaknya ditampilkan saat memilih, bukan setelah tersimpan. */}
        {dipilih && data.current && (
          <div className="rounded-md border px-3 py-2 text-xs">
            <p>
              Baseline berlaku {formatCurrency(data.current.amount)} →{" "}
              <strong>{formatCurrency(dipilih.amount)}</strong>
            </p>
            {selisih !== null && selisih !== 0 && (
              <p className={selisih > 0 ? "text-destructive" : "text-success"}>
                {selisih > 0 ? "Naik" : "Turun"} {formatCurrency(Math.abs(selisih))}{" "}
                dari baseline yang sedang berlaku.
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          <Label>
            Alasan{" "}
            <span className="text-muted-foreground">
              {wajibAlasan ? "(wajib)" : "(opsional untuk baseline pertama)"}
            </span>
          </Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Mis. tambahan lingkup panel cadangan atas permintaan pelanggan."
          />
        </div>

        {problems.length > 0 && costingNumber !== "" && (
          <ul className="space-y-1 text-xs text-destructive">
            {problems.map((p) => (
              <li key={p}>{SET_BASELINE_MESSAGE[p]}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending || problems.length > 0}>
            {pending
              ? "Menyimpan…"
              : data.current
                ? "Ganti baseline"
                : "Tetapkan baseline"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
