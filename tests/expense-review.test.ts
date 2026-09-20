import test from "node:test";
import assert from "node:assert/strict";
import {
  mockExpenseReview,
  REVIEW_FLAG_MESSAGE,
  reviewFlags,
  sortReviewQueue,
  splitReviewByHolder,
  staleReviewItems,
  sumReview,
  type ReviewItem,
} from "../src/lib/expense-review";
import { PENDING_STALE_DAYS } from "../src/lib/project-cost-board";

const baris = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  id: "x",
  number: "001/EXP/FIN/IX/2026",
  projectId: "clx8n2k4p0001qw3f7yz9abcd",
  projectName: "Proyek",
  projectNumber: "012/PRJ",
  description: "belanja",
  vendor: "Toko A",
  category: "OTHER",
  costTypeCode: "LAIN-LAIN",
  amount: 100_000,
  tax: 0,
  total: 100_000,
  approvalStatus: "SUBMITTED",
  submittedBy: "Budi",
  ageDays: 1,
  fromReceipt: false,
  hasEvidence: true,
  editedFields: [],
  ...over,
});

test("antrean diurutkan menurut lama menunggu, bukan menurut nilai", () => {
  // Mengurutkan menurut nilai membuat belanja kecil mengendap selamanya,
  // padahal justru belanja kecil yang paling sering menghalangi penutupan
  // proyek.
  const urut = sortReviewQueue([
    baris({ id: "kecil-tua", total: 50_000, ageDays: 20 }),
    baris({ id: "besar-baru", total: 90_000_000, ageDays: 1 }),
  ]);
  assert.deepEqual(urut.map((i) => i.id), ["kecil-tua", "besar-baru"]);
});

test("pada umur sama, yang sudah diajukan didahulukan", () => {
  // Bola ada di tangan finance; draf masih di tangan pengajunya.
  const urut = sortReviewQueue([
    baris({ id: "draf", approvalStatus: "DRAFT", ageDays: 5 }),
    baris({ id: "diajukan", approvalStatus: "SUBMITTED", ageDays: 5 }),
  ]);
  assert.deepEqual(urut.map((i) => i.id), ["diajukan", "draf"]);
});

test("pengurutan tidak mengubah daftar aslinya", () => {
  const items = [baris({ id: "a", ageDays: 1 }), baris({ id: "b", ageDays: 9 })];
  const salinan = items.map((i) => i.id);
  sortReviewQueue(items);
  assert.deepEqual(items.map((i) => i.id), salinan);
});

test("draf dan pengajuan dipisah menurut siapa yang memegang bolanya", () => {
  // Menaruh keduanya dalam satu daftar membuat finance merasa punya
  // tunggakan yang sebenarnya bukan miliknya.
  const { diFinance, diPengaju } = splitReviewByHolder(mockExpenseReview().items);
  assert.ok(diFinance.every((i) => i.approvalStatus === "SUBMITTED"));
  assert.ok(diPengaju.every((i) => i.approvalStatus === "DRAFT"));
  assert.equal(
    diFinance.length + diPengaju.length,
    mockExpenseReview().items.length,
  );
});

test("ambang mengendap sama dengan yang dipakai papan biaya", () => {
  // Dua layar yang memperingatkan pada hari berbeda untuk baris yang sama
  // membuat orang berhenti mempercayai keduanya.
  assert.equal(staleReviewItems([baris({ ageDays: PENDING_STALE_DAYS })]).length, 1);
  assert.equal(staleReviewItems([baris({ ageDays: PENDING_STALE_DAYS - 1 })]).length, 0);
});

test("biaya tanpa bukti ditandai, karena menyetujuinya tanpa dasar tertulis", () => {
  assert.ok(reviewFlags(baris({ hasEvidence: false })).includes("TANPA_BUKTI"));
  assert.ok(!reviewFlags(baris()).includes("TANPA_BUKTI"));
});

test("angka yang diubah manusia dari hasil baca ditandai", () => {
  const f = reviewFlags(baris({ editedFields: ["amount", "vendor"] }));
  assert.ok(f.includes("ANGKA_DIUBAH"));
});

test("baris yang sudah lengkap dan masih baru tidak ditandai apa pun", () => {
  assert.deepEqual(reviewFlags(baris()), []);
});

test("tanda adalah penunjuk, bukan penolakan", () => {
  // Tiap tanda harus punya kalimat yang menjelaskan apa yang perlu dilihat,
  // bukan perintah menolak.
  for (const key of Object.keys(REVIEW_FLAG_MESSAGE) as (keyof typeof REVIEW_FLAG_MESSAGE)[]) {
    assert.ok(REVIEW_FLAG_MESSAGE[key].length > 20, key);
  }
});

test("total antrean adalah jumlah nilai barisnya", () => {
  assert.equal(sumReview([baris({ total: 100 }), baris({ total: 250 })]), 350);
  assert.equal(sumReview([]), 0);
});

test("data tiruan memuat keempat tanda sekaligus", () => {
  // Supaya keempat keadaan benar-benar bisa dilihat saat tampilannya diuji.
  const semua = new Set(mockExpenseReview().items.flatMap(reviewFlags));
  for (const f of ["TANPA_BUKTI", "TANPA_JENIS_BIAYA", "ANGKA_DIUBAH", "MENGENDAP"]) {
    assert.ok(semua.has(f as never), f);
  }
});
