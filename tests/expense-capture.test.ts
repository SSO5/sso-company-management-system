import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPTURE_FORM_MESSAGE,
  CAPTURE_WARNING_MESSAGE,
  changedFromExtraction,
  initialFormValues,
  captureWarnings,
  formatFileSize,
  isPreviewableImage,
  lineDrift,
  loadExpenseCapture,
  mockExpenseCapture,
  MAX_RECEIPT_BYTES,
  RECEIPT_FILE_MESSAGE,
  receiptFileProblem,
  RECONCILE_TOLERANCE,
  suggestVendors,
  suggestedAmount,
  sumItems,
  validateCaptureForm,
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

/* --- pemeriksaan berkas struk --- */

test("hanya foto dan PDF yang diterima sebagai struk", () => {
  // Daftar sengaja lebih sempit daripada ALLOWED_EXTENSIONS di storage.ts:
  // menawarkan .xlsx hanya membuat orang mengunggah berkas yang pasti tidak
  // bisa dibaca sebagai struk.
  for (const name of ["struk.jpg", "struk.JPEG", "struk.png", "a.webp", "b.heic", "c.pdf"]) {
    assert.equal(receiptFileProblem({ name, size: 1_000 }), null, name);
  }
  for (const name of ["data.xlsx", "arsip.zip", "catatan.docx", "tanpaekstensi"]) {
    assert.equal(
      receiptFileProblem({ name, size: 1_000 }),
      "JENIS_TIDAK_DIDUKUNG",
      name,
    );
  }
});

test("batas ukuran di bawah bodySizeLimit Server Action", () => {
  // Kalau batasnya sama atau lebih besar dari 25MB, berkas akan lolos di
  // browser lalu gagal di server dengan galat yang tidak menyebut ukuran.
  assert.ok(MAX_RECEIPT_BYTES < 25 * 1024 * 1024);
  assert.equal(receiptFileProblem({ name: "a.jpg", size: MAX_RECEIPT_BYTES }), null);
  assert.equal(
    receiptFileProblem({ name: "a.jpg", size: MAX_RECEIPT_BYTES + 1 }),
    "TERLALU_BESAR",
  );
});

test("berkas kosong ditolak lebih dulu daripada jenisnya", () => {
  // Foto gagal ambil menghasilkan berkas 0 byte, dan pesan "jenis tidak
  // didukung" akan menyesatkan.
  assert.equal(receiptFileProblem({ name: "a.jpg", size: 0 }), "KOSONG");
  assert.equal(receiptFileProblem({ name: "a.zip", size: 0 }), "KOSONG");
});

test("HEIC boleh diunggah tapi tidak dijanjikan bisa dipratinjau", () => {
  // Tidak ada browser yang merender HEIC tanpa konversi; menampilkannya
  // sebagai gambar hanya menghasilkan kotak rusak.
  assert.equal(receiptFileProblem({ name: "struk.heic", size: 1_000 }), null);
  assert.equal(isPreviewableImage("struk.heic"), false);
  assert.equal(isPreviewableImage("struk.jpg"), true);
  assert.equal(isPreviewableImage("struk.pdf"), false);
});

test("ukuran berkas ditulis dalam satuan yang dibaca orang", () => {
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(2048), "2 KB");
  assert.equal(formatFileSize(3 * 1024 * 1024), "3.0 MB");
});

test("tiap penolakan berkas punya kalimat penjelasnya sendiri", () => {
  for (const key of Object.keys(RECEIPT_FILE_MESSAGE) as (keyof typeof RECEIPT_FILE_MESSAGE)[]) {
    assert.ok(RECEIPT_FILE_MESSAGE[key].length > 20, key);
  }
});

/* --- formulir draf --- */

test("nilai awal memisahkan pajak dari nilai, bukan menumpuknya", () => {
  // ProjectExpense menyimpan total = amount + tax. Menaruh total yang sudah
  // termasuk pajak ke kolom amount akan menghitung pajaknya dua kali.
  const f = initialFormValues(struk({ tax: 22_000, total: 222_000 }));
  assert.equal(f.amount, 200_000);
  assert.equal(f.tax, 22_000);
  assert.equal(f.amount + f.tax, 222_000);
});

test("tanpa hasil baca, formulir kosong dan bukan berisi angka karangan", () => {
  const f = initialFormValues(null);
  assert.equal(f.vendor, "");
  assert.equal(f.date, "");
  assert.equal(f.amount, 0);
  assert.equal(f.tax, 0);
});

test("nilai tidak pernah negatif walau pajak melebihi total", () => {
  // Struk salah baca bisa menghasilkan pajak lebih besar dari total; nilai
  // negatif akan lolos ke draf dan mengurangi biaya proyek.
  const f = initialFormValues(struk({ tax: 500_000, total: 200_000 }));
  assert.equal(f.amount, 0);
});

test("keterangan diringkas, bukan menyalin seluruh struk", () => {
  const banyak = struk({
    items: [item(1, 1), item(1, 1), item(1, 1), item(1, 1), item(1, 1)],
  });
  banyak.items.forEach((it, i) => (it.description = `barang ${i + 1}`));
  const f = initialFormValues(banyak);
  assert.match(f.description, /barang 1, barang 2, barang 3, dan 2 barang lain/);
});

test("kolom yang diubah manusia ditandai, yang dibiarkan tidak", () => {
  // Finance perlu tahu angka mana yang datang dari struk dan mana yang
  // diketik ulang manusia.
  const e = struk();
  const awal = initialFormValues(e);
  assert.deepEqual(changedFromExtraction(e, awal), []);
  assert.deepEqual(changedFromExtraction(e, { ...awal, amount: 999 }), ["amount"]);
  assert.deepEqual(
    changedFromExtraction(e, { ...awal, vendor: "Lain", tax: 1 }).sort(),
    ["tax", "vendor"],
  );
});

test("memilih jenis biaya tidak dihitung sebagai mengubah hasil baca", () => {
  // Jenis biaya memang selalu diisi manusia; menandainya hanya jadi derau.
  const e = struk();
  const awal = initialFormValues(e);
  assert.deepEqual(changedFromExtraction(e, { ...awal, costTypeId: "ct-1" }), []);
});

test("jenis biaya WAJIB di jalur struk", () => {
  // Berbeda dari pencatatan manual: draf dari struk selalu baru, dan tanpa
  // jenis biaya ia tidak akan pernah bisa diadu dengan pagu baseline.
  const lengkap = {
    vendor: "Toko A",
    date: "2026-09-19",
    costTypeId: "ct-1",
    description: "kabel",
    amount: 100_000,
    tax: 0,
  };
  assert.deepEqual(validateCaptureForm(lengkap), []);
  assert.deepEqual(validateCaptureForm({ ...lengkap, costTypeId: "" }), [
    "JENIS_BIAYA_KOSONG",
  ]);
});

test("seluruh kekurangan dilaporkan sekaligus", () => {
  const problems = validateCaptureForm({
    vendor: "  ",
    date: "",
    costTypeId: "",
    description: "",
    amount: 0,
    tax: -1,
  });
  assert.equal(problems.length, 6);
});

test("tiap kekurangan formulir punya kalimat penjelasnya sendiri", () => {
  for (const key of Object.keys(CAPTURE_FORM_MESSAGE) as (keyof typeof CAPTURE_FORM_MESSAGE)[]) {
    assert.ok(CAPTURE_FORM_MESSAGE[key].length > 15, key);
  }
});
