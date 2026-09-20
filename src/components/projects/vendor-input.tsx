"use client";

import { useRef, useState } from "react";
import { Check, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  isKnownVendor,
  nearMatches,
  suggestVendors,
} from "@/lib/expense-capture";
import { cn } from "@/lib/utils";

/**
 * Isian nama vendor dengan saran dari riwayat proyek.
 *
 * Vendor pada ProjectExpense adalah teks bebas, dan teks bebas selalu
 * melahirkan kembaran: "PT Kabel Metal", "pt kabel metal", "PT. Kabel
 * Metal". Ketiganya satu toko, tapi laporan belanja per vendor akan
 * menghitungnya sebagai tiga.
 *
 * Dua lapis penanganannya, dan urutannya penting:
 *
 *   1. SARAN SAAT MENGETIK. Cara termurah menghindari kembaran adalah
 *      membuat memilih lebih mudah daripada mengetik.
 *   2. PERINGATAN "MIRIP DENGAN". Kalau orang tetap mengetik nama yang
 *      hampir sama, layar bertanya sebelum kembarannya terbentuk — bukan
 *      setelah laporan terlanjur pecah.
 *
 * Yang sengaja TIDAK dilakukan: memaksa memilih dari daftar. Vendor baru
 * memang sering muncul, dan daftar tertutup akan membuat orang menulis nama
 * asal di kolom keterangan supaya bisa lanjut.
 */
export function VendorInput({
  value,
  onChange,
  history,
  id = "vendor",
}: {
  value: string;
  onChange: (next: string) => void;
  history: string[];
  id?: string;
}) {
  const [fokus, setFokus] = useState(false);
  const [sorot, setSorot] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saran = suggestVendors(history, value);
  const mirip = nearMatches(history, value);
  const dikenal = isKnownVendor(history, value);
  const tampilkanSaran = fokus && saran.length > 0;

  function pilih(nama: string) {
    onChange(nama);
    setFokus(false);
    setSorot(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!tampilkanSaran) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSorot((s) => (s + 1) % saran.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSorot((s) => (s <= 0 ? saran.length - 1 : s - 1));
    } else if (e.key === "Enter" && sorot >= 0) {
      e.preventDefault();
      pilih(saran[sorot]);
    } else if (e.key === "Escape") {
      setFokus(false);
      setSorot(-1);
    }
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          value={value}
          autoComplete="off"
          placeholder="Nama toko atau vendor"
          onChange={(e) => {
            onChange(e.target.value);
            setSorot(-1);
          }}
          onFocus={() => setFokus(true)}
          // Klik pada saran terjadi SETELAH blur, jadi penutupannya ditunda.
          onBlur={() => {
            blurTimer.current = setTimeout(() => setFokus(false), 120);
          }}
          onKeyDown={onKeyDown}
          aria-autocomplete="list"
          aria-expanded={tampilkanSaran}
        />

        {tampilkanSaran && (
          <ul
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background py-1 shadow-md"
            role="listbox"
          >
            {saran.map((nama, i) => (
              <li key={nama}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === sorot}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                    i === sorot ? "bg-muted" : "hover:bg-muted",
                  )}
                  onMouseEnter={() => setSorot(i)}
                  onMouseDown={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                  }}
                  onClick={() => pilih(nama)}
                >
                  {nama}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dikenal && value.trim() !== "" && (
        <p className="flex items-center gap-1 text-[11px] text-success">
          <Check className="h-3 w-3" /> Vendor ini sudah pernah dipakai di proyek
          ini.
        </p>
      )}

      {/* Ditanyakan sebelum kembarannya terbentuk, bukan setelah laporan
          belanja per vendor terlanjur pecah jadi dua baris. */}
      {!dikenal && mirip.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-[11px]">
          <Info className="h-3 w-3 shrink-0 text-warning" />
          Mirip dengan yang sudah ada — maksudnya ini?
          {mirip.map((m) => (
            <button
              key={m}
              type="button"
              className="rounded border px-1.5 py-0.5 hover:bg-muted"
              onClick={() => pilih(m)}
            >
              {m}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
