"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CostTypeStatusFilter } from "@/lib/cost-type";

/**
 * Pencarian dan saringan status untuk daftar jenis biaya.
 *
 * Keadaannya disimpan di URL, bukan di dalam komponen. Alasannya praktis:
 * setelah menonaktifkan sebuah jenis, halaman disegarkan — dan saringan yang
 * hanya hidup di memori akan hilang persis ketika orang sedang merapikan
 * daftar panjang. URL juga bisa dikirim ke orang lain apa adanya.
 *
 * Kotak pencarian diketik dulu, baru dikirim saat form disubmit atau saat
 * berhenti mengetik. Mengirim tiap ketukan akan memuat ulang halaman
 * berkali-kali untuk satu kata.
 */

const STATUS: { value: CostTypeStatusFilter; label: string }[] = [
  { value: "ALL", label: "Semua status" },
  { value: "ACTIVE", label: "Aktif saja" },
  { value: "INACTIVE", label: "Nonaktif saja" },
  { value: "UNMAPPED", label: "Belum dipetakan" },
];

export function CostTypeFilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const qUrl = params.get("q") ?? "";
  const status = (params.get("status") ?? "ALL") as CostTypeStatusFilter;
  const [q, setQ] = useState(qUrl);

  // Kalau URL berubah dari luar (tombol kembali, tautan), kotak ikut.
  useEffect(() => setQ(qUrl), [qUrl]);

  const apply = (next: { q?: string; status?: string }) => {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    // "ALL" adalah bawaan; menuliskannya di URL hanya bikin ramai.
    if (sp.get("status") === "ALL") sp.delete("status");
    router.replace(sp.toString() ? `?${sp.toString()}` : "?");
  };

  const adaSaringan = Boolean(qUrl) || status !== "ALL";

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q });
      }}
    >
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kode, nama, atau kode akun…"
          aria-label="Cari jenis biaya"
          className="pl-8"
        />
      </div>

      <Select
        value={status}
        aria-label="Saring menurut status"
        onChange={(e) => apply({ q, status: e.target.value })}
        className="w-auto"
      >
        {STATUS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>

      <Button type="submit" variant="outline" size="sm">
        Cari
      </Button>

      {adaSaringan && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            apply({ q: "", status: "" });
          }}
        >
          <X className="h-3.5 w-3.5" /> Bersihkan
        </Button>
      )}
    </form>
  );
}
