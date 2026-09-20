"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { VendorInput } from "@/components/projects/vendor-input";
import { saveCaptureDraftAction } from "@/server/projects/expense-capture";
import {
  CAPTURE_FORM_MESSAGE,
  changedFromExtraction,
  initialFormValues,
  validateCaptureForm,
  type CaptureField,
  type CaptureFormValues,
  type ExpenseCaptureDraft,
} from "@/lib/expense-capture";
import { formatCurrency } from "@/lib/utils";

/**
 * Formulir draf biaya dari hasil pembacaan struk.
 *
 * SEMUA kolom bisa diubah. Hasil baca hanyalah isian awal, dan formulir yang
 * mengunci angka hasil mesin memaksa orang membatalkan lalu mengetik ulang
 * dari nol — yang berakhir dengan fitur ini ditinggalkan.
 *
 * Kolom yang diubah dari hasil baca DITANDAI, dan itu bukan hiasan: finance
 * yang meninjau perlu tahu angka mana yang datang dari struk dan mana yang
 * diketik manusia. Keduanya sah, tapi bobotnya berbeda — angka yang diubah
 * biasanya punya alasan, sedangkan angka yang dibiarkan apa adanya belum
 * tentu pernah dilihat.
 *
 * Total dihitung di layar dari nilai + pajak, bukan diketik terpisah. Dua
 * kolom yang bisa saling bertentangan adalah cara pasti membuat draf masuk
 * dengan angka yang tidak pernah dimaksudkan siapa pun.
 */

const LABEL: Record<CaptureField, string> = {
  vendor: "Vendor",
  date: "Tanggal",
  costTypeId: "Jenis biaya",
  description: "Keterangan",
  amount: "Nilai",
  tax: "Pajak",
};

export function CaptureDraftForm({ data }: { data: ExpenseCaptureDraft }) {
  const [form, setForm] = useState(() => initialFormValues(data.extracted));
  const [pending, setPending] = useState(false);
  const [dicoba, setDicoba] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const problems = validateCaptureForm(form);
  const diubah = changedFromExtraction(data.extracted, form);
  const total = form.amount + form.tax;

  const set = <K extends CaptureField>(key: K, value: CaptureFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function simpan() {
    setDicoba(true);
    if (problems.length > 0) return;
    setPending(true);
    const res = await saveCaptureDraftAction(
      data.projectId,
      data.documentId,
      form,
    );
    setPending(false);
    if (res.ok) {
      toast({ title: "Draf biaya dibuat", variant: "success" });
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
        <CardTitle className="text-sm">Draf biaya</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Semua kolom bisa diubah. Hasil baca hanya mengisi awal — yang disimpan
          adalah apa yang Anda lihat di sini.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="vendor">Vendor</Label>
            <VendorInput
              value={form.vendor}
              onChange={(next) => set("vendor", next)}
              history={data.vendorHistory}
            />
          </div>

          <div className="space-y-1">
            <Label>Tanggal struk</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label>Jenis biaya</Label>
            <Select
              value={form.costTypeId}
              onChange={(e) => set("costTypeId", e.target.value)}
            >
              <option value="">— Pilih jenis biaya —</option>
              {data.costTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Wajib di jalur ini. Tanpa jenis biaya, pengeluaran ini tidak akan
              pernah bisa diadu dengan pagu baseline — yang justru seluruh alasan
              struknya difoto.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Nilai sebelum pajak (Rp)</Label>
            <Input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => set("amount", Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label>Pajak (Rp)</Label>
            <Input
              type="number"
              min={0}
              value={form.tax}
              onChange={(e) => set("tax", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Keterangan</Label>
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Belanja apa, untuk pekerjaan apa."
          />
        </div>

        {/* Total dihitung, bukan diketik: dua kolom yang bisa saling
            bertentangan akan meloloskan angka yang tidak dimaksudkan siapa pun. */}
        <p className="rounded-md border px-3 py-2 text-sm">
          Total draf: <strong className="tabular-nums">{formatCurrency(total)}</strong>
          <span className="block text-[11px] text-muted-foreground">
            Nilai {formatCurrency(form.amount)} + pajak {formatCurrency(form.tax)}.
            Dihitung otomatis, tidak bisa diketik terpisah.
          </span>
        </p>

        {diubah.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            Diubah dari hasil baca:
            {diubah.map((f) => (
              <Badge key={f} variant="outline">
                {LABEL[f]}
              </Badge>
            ))}
          </p>
        )}

        {dicoba && problems.length > 0 && (
          <ul className="space-y-1 text-xs text-destructive">
            {problems.map((p) => (
              <li key={p}>{CAPTURE_FORM_MESSAGE[p]}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button onClick={simpan} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan sebagai draf"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
