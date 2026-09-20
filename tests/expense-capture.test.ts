import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPTURE_WARNING_MESSAGE,
  captureWarnings,
  lineDrift,
  loadExpenseCapture,
  mockExpenseCapture,
  RECONCILE_TOLERANCE,
  suggestVendors,
  suggestedAmount,
  sumItems,
  type ExtractedReceipt,
} from "../src/lib/expense-capture";

const id = "clx8n2k4p0001qw3f7yz9abcd";

const item = (qty: number, harga: number, total = qty * harga) => ({
  description: "barang",
  quantity: qty,
  unit: "pcs",
  unitPrice: harga,
  total,
});

const struk = (over: Partial<ExtractedReceipt> = {}): ExtractedReceipt => ({
  vendor: "Toko A",
  date: "2026-09-19",
  items: [item(2, 100_000)],
  subtotal: 200_000,
  tax: 0,
  total: 200_000,
  ...over,
});

test("struk yang bersih tidak menghasilkan peringatan apa pun", () => {
  assert.deepEqual(captureWarnings(struk()), []);
});

test("jumlah baris yang tidak sama dengan total tercetak ditangkap", () => {
  // Pembacaan otomatis jarang gagal total. Yang sering terjadi adalah satu
  // baris terlewat, dan hasilnya tetap terlihat masuk akal.
  const w = captureWarnings(struk({ total: 350_000 }));
  assert.ok(w.includes("TOTAL_TIDAK_COCOK"));
});

test("pajak ikut dihitung saat mengadu jumlah baris dengan total", () => {
  // Tanpa ini, setiap struk berpajak akan selalu ditandai salah.
  assert.deepEqual(
    captureWarnings(struk({ tax: 22_000, total: 222_000 })),
    [],
  );
});

test("selisih serupiah dianggap pembulatan, bukan salah baca", () => {
  assert.deepEqual(captureWarnings(struk({ total: 200_000 + RECONCILE_TOLERANCE })), []);
  assert.ok(
    captureWarnings(struk({ total: 200_000 + RECONCILE_TOLERANCE + 1 })).includes(
      "TOTAL_TIDAK_COCOK",
    ),
  );
});

test("baris yang nilainya tidak sama dengan qty kali harga ditandai", () => {
  const w = captureWarnings(
    struk({ items: [item(6, 185_000, 1_210_000)], total: 1_210_000 }),
  );
  assert.ok(w.includes("BARIS_TIDAK_KONSISTEN"));
  assert.equal(lineDrift(item(6, 185_000, 1_210_000)), 100_000);
});

test("kolom yang tidak terbaca dilaporkan satu per satu", () => {
  const w = captureWarnings(
    struk({ vendor: null, date: null, total: null, items: [] }),
  );
  assert.ok(w.includes("VENDOR_KOSONG"));
  assert.ok(w.includes("TANGGAL_KOSONG"));
  assert.ok(w.includes("TOTAL_KOSONG"));
  assert.ok(w.includes("TIDAK_ADA_BARIS"));
});

test("tanpa hasil baca, tidak ada peringatan yang dikarang", () => {
  assert.deepEqual(captureWarnings(null), []);
});

test("total tercetak selalu menang atas jumlah baris", () => {
  // Itulah yang benar-benar dibayar.
  assert.equal(suggestedAmount(struk({ total: 999_000 })), 999_000);
  // Jumlah baris hanya dipakai kalau totalnya tidak terbaca.
  assert.equal(suggestedAmount(struk({ total: null })), 200_000);
  // Kalau keduanya kosong, nol — supaya orang mengisinya sendiri, bukan
  // menerima angka karangan.
  assert.equal(suggestedAmount(struk({ total: null, items: [] })), 0);
  assert.equal(suggestedAmount(null), 0);
});

test("saran vendor menyaring dari riwayat tanpa peduli besar kecil huruf", () => {
  const riwayat = ["Toko Sinar Jaya", "CV Elektrindo", "Toko Bangunan Makmur"];
  assert.deepEqual(suggestVendors(riwayat, "toko"), [
    "Toko Sinar Jaya",
    "Toko Bangunan Makmur",
  ]);
  assert.equal(suggestVendors(riwayat, "").length, 3);
  assert.deepEqual(suggestVendors(riwayat, "zzz"), []);
});

test("riwayat vendor tidak menawarkan nama kembar atau kosong", () => {
  assert.deepEqual(
    suggestVendors(["Toko A", " Toko A ", "", "   ", "Toko B"], ""),
    ["Toko A", "Toko B"],
  );
});

test("data tiruan memuat struk yang memang ganjil", () => {
  // Supaya keadaan "perlu dicek" benar-benar bisa dilihat saat tampilannya
  // diuji, bukan cuma ada di kode.
  const d = mockExpenseCapture(id);
  const w = captureWarnings(d.extracted);
  assert.ok(w.includes("BARIS_TIDAK_KONSISTEN"));
  assert.ok(sumItems(d.extracted!.items) > 0);
});

test("tiap peringatan punya kalimat penjelasnya sendiri", () => {
  for (const key of Object.keys(CAPTURE_WARNING_MESSAGE) as (keyof typeof CAPTURE_WARNING_MESSAGE)[]) {
    assert.ok(CAPTURE_WARNING_MESSAGE[key].length > 20, key);
  }
});

test("alamat yang bukan id proyek tidak menghasilkan halaman unggah", async () => {
  assert.equal(await loadExpenseCapture("bukan-id"), null);
  assert.notEqual(await loadExpenseCapture(id), null);
});
