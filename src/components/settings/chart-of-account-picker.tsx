"use client";

import Link from "next/link";
import { Select } from "@/components/ui/select";

/**
 * Pemilih akun pada Bagan Akun untuk satu jenis biaya.
 *
 * Tiga keputusan yang membuatnya bukan sekadar <select> daftar akun:
 *
 *   1. AKUN BEBAN DIDAHULUKAN. Biaya proyek hampir selalu bermuara ke akun
 *      beban (5-xxx/6-xxx). Akun lain tetap bisa dipilih — ada kasus sah
 *      seperti material yang dikapitalisasi — tapi menaruhnya berbaur dalam
 *      satu daftar panjang membuat salah pilih jadi mudah dan sulit terlihat.
 *   2. PILIHAN KOSONG ADA DI ATAS DAN PUNYA NAMA. "Belum dipetakan" adalah
 *      keadaan yang sah dan ditandai di daftar, bukan kegagalan mengisi.
 *   3. BAGAN AKUN KOSONG DIJELASKAN, BUKAN DIBIARKAN JADI SELECT KOSONG.
 *      Kalau belum ada akun beban sama sekali, yang dibutuhkan orang adalah
 *      tautan ke Bagan Akun, bukan kotak pilihan yang tidak berisi apa-apa.
 */

export interface AccountOption {
  id: string;
  code: string;
  name: string;
  /** AccountType dari Prisma; dipakai untuk mendahulukan akun beban. */
  type: string;
}

/** Akun yang wajar menampung biaya proyek. */
export function isExpenseAccount(account: { type: string }): boolean {
  return account.type === "EXPENSE";
}

export function ChartOfAccountPicker({
  accounts,
  defaultAccountId,
  name = "chartOfAccountId",
}: {
  accounts: AccountOption[];
  defaultAccountId?: string | null;
  name?: string;
}) {
  const beban = accounts.filter(isExpenseAccount);
  const lainnya = accounts.filter((a) => !isExpenseAccount(a));

  if (accounts.length === 0) {
    return (
      <div className="space-y-1">
        {/* Tetap dikirim supaya form punya nilai yang jelas, bukan field hilang. */}
        <input type="hidden" name={name} value="" />
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Bagan Akun masih kosong, jadi belum ada yang bisa dipetakan. Jenis biaya
          ini tetap bisa dibuat dan dipetakan nanti.{" "}
          <Link
            href="/settings/chart-of-accounts"
            className="text-primary hover:underline"
          >
            Buka Bagan Akun →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Select name={name} defaultValue={defaultAccountId ?? ""}>
        <option value="">— Belum dipetakan —</option>
        {beban.length > 0 && (
          <optgroup label="Akun beban">
            {beban.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </optgroup>
        )}
        {lainnya.length > 0 && (
          <optgroup label="Akun lain (jarang dipakai untuk biaya proyek)">
            {lainnya.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
      {beban.length === 0 && (
        <p className="text-[11px] text-warning">
          Belum ada akun bertipe Beban di Bagan Akun. Biaya proyek biasanya bermuara
          ke sana — periksa dulu sebelum memilih akun lain.
        </p>
      )}
    </div>
  );
}
