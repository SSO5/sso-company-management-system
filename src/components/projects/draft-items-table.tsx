"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  draftItemTotal,
  emptyDraftItem,
  incompleteDraftItems,
  sumDraftItems,
  type DraftItem,
} from "@/lib/expense-capture";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Rincian item draf, bisa disunting.
 *
 * Nilai tiap baris DIHITUNG dari jumlah kali harga satuan, tidak pernah
 * diketik. Itulah bedanya dengan hasil baca: struk punya nilai baris
 * tercetak yang bisa saja tidak cocok dengan perkaliannya, dan selisih itu
 * sudah ditunjukkan di tahap pemeriksaan. Begitu masuk ke sini, orang
 * memperbaiki jumlah atau harganya — dan nilainya mengikuti. Menyimpan dua
 * angka yang bisa bertentangan hanya memindahkan masalahnya.
 *
 * Rincian bersifat OPSIONAL. Banyak struk warung tidak punya baris sama
 * sekali, dan memaksa mengisinya akan membuat orang mengarang. Kalau kosong,
 * draf tetap bisa disimpan dengan satu nilai total.
 */
export function DraftItemsTable({
  items,
  onChange,
  onUseSum,
  currentAmount,
}: {
  items: DraftItem[];
  onChange: (next: DraftItem[]) => void;
  /** Dipanggil saat orang memilih memakai jumlah baris sebagai nilai draf. */
  onUseSum: (sum: number) => void;
  /** Nilai draf saat ini, untuk diadu dengan jumlah baris. */
  currentAmount: number;
}) {
  const jumlah = sumDraftItems(items);
  const belumLengkap = new Set(incompleteDraftItems(items));
  const beda = Math.abs(jumlah - currentAmount) > 1;

  const ubah = (i: number, patch: Partial<DraftItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          Rincian barang{" "}
          <span className="text-[11px] font-normal text-muted-foreground">
            (opsional)
          </span>
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {items.length} baris · {formatCurrency(jumlah)}
        </p>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className={cn(
                "grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_5rem_5rem_7rem_auto]",
                belumLengkap.has(i) && "border-warning/50 bg-warning/5",
              )}
            >
              <Input
                value={item.description}
                onChange={(e) => ubah(i, { description: e.target.value })}
                placeholder="Uraian barang"
                aria-label={`Uraian baris ${i + 1}`}
              />
              <Input
                type="number"
                min={0}
                value={item.quantity}
                onChange={(e) => ubah(i, { quantity: Number(e.target.value) })}
                aria-label={`Jumlah baris ${i + 1}`}
              />
              <Input
                value={item.unit}
                onChange={(e) => ubah(i, { unit: e.target.value })}
                placeholder="pcs"
                aria-label={`Satuan baris ${i + 1}`}
              />
              <Input
                type="number"
                min={0}
                value={item.unitPrice}
                onChange={(e) => ubah(i, { unitPrice: Number(e.target.value) })}
                aria-label={`Harga satuan baris ${i + 1}`}
              />
              <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end sm:justify-center">
                {/* Dihitung, tidak diketik. */}
                <span className="text-sm tabular-nums">
                  {formatCurrency(draftItemTotal(item))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                  aria-label={`Hapus baris ${i + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, emptyDraftItem()])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Tambah baris
        </Button>

        {/* Tidak otomatis: orang yang memutuskan angka mana yang benar —
            total yang tercetak di struk, atau rincian yang baru diperbaikinya. */}
        {items.length > 0 && beda && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onUseSum(jumlah)}
          >
            Pakai jumlah baris ({formatCurrency(jumlah)})
          </Button>
        )}
      </div>

      {belumLengkap.size > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {belumLengkap.size} baris belum punya uraian atau nilainya nol. Baris
          seperti itu tidak menambah apa pun — lengkapi atau hapus.
        </p>
      )}

      {items.length > 0 && beda && (
        <p className="text-[11px] text-muted-foreground">
          Jumlah baris {formatCurrency(jumlah)} berbeda dari nilai draf{" "}
          {formatCurrency(currentAmount)}. Itu wajar kalau rinciannya sengaja tidak
          lengkap — tapi kalau rinciannya yang benar, tekan tombol di atas.
        </p>
      )}
    </div>
  );
}
