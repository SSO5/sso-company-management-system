import test from "node:test";
import assert from "node:assert/strict";
import { isExpenseAccount } from "../src/components/settings/chart-of-account-picker";
import { mockCostTypes } from "../src/lib/cost-type";

test("hanya akun bertipe Beban yang didahulukan", () => {
  // Biaya proyek hampir selalu bermuara ke akun beban. Akun lain tetap boleh
  // dipilih, tapi tidak berbaur dalam satu daftar panjang.
  assert.equal(isExpenseAccount({ type: "EXPENSE" }), true);
  for (const type of ["ASSET", "LIABILITY", "EQUITY", "REVENUE"]) {
    assert.equal(isExpenseAccount({ type }), false, type);
  }
});

test("pemetaan yang sudah ada bisa dicocokkan lewat kode akun", () => {
  // Mode ubah harus memilih ulang pemetaan lama; CostType menyimpan kode
  // akunnya, bukan id-nya.
  const akun = [
    { id: "coa-1", code: "5-101", name: "Beban Material Proyek", type: "EXPENSE" },
    { id: "coa-2", code: "5-201", name: "Beban Tenaga Kerja", type: "EXPENSE" },
  ];
  const jenis = mockCostTypes().find((t) => t.accountCode === "5-101")!;
  assert.equal(akun.find((a) => a.code === jenis.accountCode)?.id, "coa-1");

  const belum = mockCostTypes().find((t) => t.accountCode === null)!;
  assert.equal(akun.find((a) => a.code === belum.accountCode)?.id, undefined);
});
