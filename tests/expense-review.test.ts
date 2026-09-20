import test from "node:test";
import assert from "node:assert/strict";
import {
  ageBucket,
  correctionChanges,
  correctionFrom,
  correctionProblems,
  decisionBlockedReason,
  fieldComparisons,
  rejectReasonProblem,
  REVIEW_EVENT_LABEL,
  sortReviewHistory,
  wasCorrected,
  isLargeExpense,
  LARGE_EXPENSE_THRESHOLD,
  mockExpenseReview,
  REVIEW_FLAG_MESSAGE,
  reviewFlags,
  sortReviewQueue,
  splitReviewByHolder,
  staleReviewItems,
  sumReview,
  type ReviewEvent,
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
  submittedById: "user-budi",
  ageDays: 1,
  fromReceipt: false,
  hasEvidence: true,
  editedFields: [],
  extractedSnapshot: null,
  date: "2026-09-19",
  items: [],
  evidenceDocumentId: "doc-1",
  history: [],
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

/* --- penanda umur dan nilai besar --- */

test("umur dikelompokkan, bukan diserahkan sebagai angka hari mentah", () => {
  // Angka hari menuntut pembacanya membandingkan sendiri dengan ambang yang
  // harus dia ingat. Kelompok menjawabnya langsung.
  assert.equal(ageBucket(0), "BARU");
  assert.equal(ageBucket(2), "BARU");
  assert.equal(ageBucket(3), "MENUNGGU");
  assert.equal(ageBucket(PENDING_STALE_DAYS - 1), "MENUNGGU");
  assert.equal(ageBucket(PENDING_STALE_DAYS), "MENGENDAP");
  assert.equal(ageBucket(30), "MENGENDAP");
});

test("kelompok umur tidak pernah bertentangan dengan penanda mengendap", () => {
  // Dua tempat yang memakai ambang berbeda akan membuat satu baris terbaca
  // "menunggu" di tabel tapi "mengendap" di peringatan atasnya.
  for (const hari of [0, 2, 3, 6, PENDING_STALE_DAYS, 20]) {
    const item = baris({ ageDays: hari });
    assert.equal(
      ageBucket(hari) === "MENGENDAP",
      reviewFlags(item).includes("MENGENDAP"),
      `hari ${hari}`,
    );
  }
});

test("nilai besar ditandai pada ambangnya, bukan di atasnya saja", () => {
  assert.equal(isLargeExpense({ total: LARGE_EXPENSE_THRESHOLD }), true);
  assert.equal(isLargeExpense({ total: LARGE_EXPENSE_THRESHOLD - 1 }), false);
  assert.ok(
    reviewFlags(baris({ total: LARGE_EXPENSE_THRESHOLD })).includes("NILAI_BESAR"),
  );
});

test("nilai besar bukan batas persetujuan, hanya penanda", () => {
  // Tidak ada aturan yang berubah di angka itu: baris bernilai besar tetap
  // muncul di antrean yang sama dan tetap bisa disetujui.
  const besar = baris({ total: LARGE_EXPENSE_THRESHOLD * 5 });
  const { diFinance } = splitReviewByHolder([besar]);
  assert.equal(diFinance.length, 1);
  assert.ok(reviewFlags(besar).includes("NILAI_BESAR"));
});

test("setiap penanda punya kalimat penjelas, termasuk yang baru", () => {
  for (const f of reviewFlags(
    baris({
      total: LARGE_EXPENSE_THRESHOLD,
      hasEvidence: false,
      costTypeCode: null,
      editedFields: ["amount"],
      ageDays: 30,
    }),
  )) {
    assert.ok(REVIEW_FLAG_MESSAGE[f].length > 20, f);
  }
});

/* --- panel detail --- */

test("perubahan ditampilkan dari berapa ke berapa, bukan cuma nama kolomnya", () => {
  // Tanpa nilai sebelum dan sesudah, penanda "ada angka yang diubah" hanya
  // tuduhan tanpa isi: peninjau harus membuka struknya sendiri.
  const item = baris({
    vendor: "PT Angkutan Jaya",
    date: "2026-09-18",
    amount: 9_000_000,
    tax: 0,
    editedFields: ["vendor", "date"],
    extractedSnapshot: {
      vendor: "PT Angkutan Jaja",
      date: "2026-09-16",
      amount: 9_000_000,
      tax: 0,
    },
  });
  const c = fieldComparisons(item);
  assert.deepEqual(c.map((x) => x.field), ["vendor", "date"]);
  assert.equal(c[0].before, "PT Angkutan Jaja");
  assert.equal(c[0].after, "PT Angkutan Jaya");
  assert.equal(c[1].before, "2026-09-16");
  assert.equal(c[1].after, "2026-09-18");
});

test("biaya yang diketik manual tidak punya perbandingan palsu", () => {
  // Tidak ada hasil baca untuk dibandingkan, jadi tidak ada yang ditampilkan.
  assert.deepEqual(fieldComparisons(baris({ extractedSnapshot: null })), []);
  assert.deepEqual(
    fieldComparisons(baris({ extractedSnapshot: null, editedFields: ["amount"] })),
    [],
  );
});

test("kolom yang tidak dikenal tidak memaksa baris perbandingan kosong", () => {
  // editedFields bisa memuat nama kolom yang tidak punya padanan di hasil
  // baca; menampilkannya sebagai "— → —" hanya jadi derau.
  const c = fieldComparisons(
    baris({
      editedFields: ["amount", "costTypeId"],
      extractedSnapshot: { vendor: null, date: null, amount: 1, tax: 0 },
    }),
  );
  assert.deepEqual(c.map((x) => x.field), ["amount"]);
});

test("tiap perbandingan punya label yang bisa dibaca orang", () => {
  const c = fieldComparisons(
    baris({
      editedFields: ["vendor", "amount", "tax"],
      extractedSnapshot: { vendor: "A", date: null, amount: 1, tax: 2 },
    }),
  );
  for (const x of c) {
    assert.notEqual(x.label, x.field, x.field);
    assert.ok(x.label.length > 2);
  }
});

/* --- siapa yang boleh memutuskan --- */

// Finance adalah peninjau di seluruh berkas ini — bukan Admin — mengikuti
// keputusan eksplisit pemilik sistem: persetujuan biaya proyek adalah
// wewenang Finance, termasuk saat pengajunya Admin (Direktur).
const finance = { role: "FINANCE", userId: "user-finance" };

test("draf tidak bisa diputuskan siapa pun, termasuk Finance", () => {
  // Bola masih di tangan pengajunya; belum ada yang diajukan.
  const alasan = decisionBlockedReason(
    { approvalStatus: "DRAFT", submittedById: "user-budi" },
    finance,
  );
  assert.match(alasan ?? "", /Masih draf/);
});

test("hanya Finance yang menyetujui biaya, mengikuti maker-checker yang berlaku", () => {
  // Termasuk ADMIN: biaya yang diajukan Direktur sekalipun tetap wajib
  // lewat persetujuan Finance, bukan disetujui sesama Admin.
  for (const role of ["ADMIN", "PROJECT_MANAGER", "SALES", "IT", "VIEWER"]) {
    const alasan = decisionBlockedReason(
      { approvalStatus: "SUBMITTED", submittedById: "user-budi" },
      { role, userId: "user-x" },
    );
    assert.match(alasan ?? "", /Hanya Finance/, role);
  }
});

test("biaya yang diajukan Admin tetap butuh Finance, bukan Admin lain", () => {
  // Ini persis kasus yang secara eksplisit ditegaskan pemilik sistem:
  // Direktur bukan pengecualian.
  const alasan = decisionBlockedReason(
    { approvalStatus: "SUBMITTED", submittedById: "user-admin-direktur" },
    { role: "ADMIN", userId: "user-admin-lain" },
  );
  assert.match(alasan ?? "", /Hanya Finance/);
});

test("Finance tidak boleh menyetujui pengajuannya sendiri", () => {
  const alasan = decisionBlockedReason(
    { approvalStatus: "SUBMITTED", submittedById: "user-finance" },
    finance,
  );
  assert.match(alasan ?? "", /Anda sendiri yang mengajukan/);
});

test("Finance lain boleh memutuskan, termasuk atas pengajuan Admin", () => {
  assert.equal(
    decisionBlockedReason(
      { approvalStatus: "SUBMITTED", submittedById: "user-budi" },
      finance,
    ),
    null,
  );
  assert.equal(
    decisionBlockedReason(
      { approvalStatus: "SUBMITTED", submittedById: "user-admin-direktur" },
      finance,
    ),
    null,
  );
});

test("alasan penghalang selalu berupa kalimat, bukan boolean", () => {
  // Tombol mati tanpa alasan membuat orang mengira aplikasinya rusak.
  const kasus = [
    { approvalStatus: "DRAFT" as const, submittedById: "x" },
    { approvalStatus: "SUBMITTED" as const, submittedById: "user-finance" },
  ];
  for (const k of kasus) {
    const alasan = decisionBlockedReason(k, finance);
    assert.ok(alasan && alasan.length > 30, JSON.stringify(k));
  }
});

test("penolakan menuntut alasan yang bisa ditindak", () => {
  // Penolakan tanpa itu akan kembali lagi dalam bentuk yang sama minggu
  // depan: pengajunya tidak punya cara tahu apa yang harus diperbaiki.
  assert.ok(rejectReasonProblem(""));
  assert.ok(rejectReasonProblem("   "));
  assert.ok(rejectReasonProblem("salah"));
  assert.equal(
    rejectReasonProblem("Nota tidak mencantumkan nama toko, minta ulang."),
    null,
  );
});

/* --- koreksi sebelum disetujui --- */

const diajukan = baris({ approvalStatus: "SUBMITTED", submittedById: "user-budi" });

test("koreksi yang tidak mengubah apa pun ditolak", () => {
  // Menyimpan "koreksi" kosong hanya menambah baris riwayat yang tidak
  // menceritakan apa-apa.
  const sama = correctionFrom(diajukan);
  assert.deepEqual(correctionChanges(diajukan, sama), []);
  assert.ok(
    correctionProblems(diajukan, sama, "catatan yang cukup panjang", finance).includes(
      "Belum ada yang diubah.",
    ),
  );
});

test("perubahan dilaporkan dari berapa ke berapa", () => {
  const next = { ...correctionFrom(diajukan), amount: 250_000, vendor: "Toko B" };
  const c = correctionChanges(diajukan, next);
  assert.deepEqual(c.map((x) => x.field).sort(), ["amount", "vendor"]);
  const amount = c.find((x) => x.field === "amount")!;
  assert.equal(amount.before, "100000");
  assert.equal(amount.after, "250000");
});

test("catatan koreksi wajib, dan tidak boleh sekadar sepatah kata", () => {
  // Pengajunya mencatat satu hal dan yang tersimpan menjadi hal lain;
  // catatan adalah satu-satunya cara dia tahu apa yang terjadi.
  const next = { ...correctionFrom(diajukan), amount: 250_000 };
  assert.ok(correctionProblems(diajukan, next, "", finance).length > 0);
  assert.ok(correctionProblems(diajukan, next, "salah", finance).length > 0);
  assert.deepEqual(
    correctionProblems(diajukan, next, "Nilai di struk 250.000, bukan 100.000.", finance),
    [],
  );
});

test("yang boleh mengoreksi sama dengan yang boleh memutuskan", () => {
  // Mengizinkan orang lain mengubah angka lalu menyerahkannya ke Finance
  // untuk disetujui akan membuat maker-checker kehilangan artinya. ADMIN
  // sengaja diuji di sini juga: Direktur bukan pengecualian.
  const next = { ...correctionFrom(diajukan), amount: 250_000 };
  const catatan = "Nilai di struk berbeda dari yang diketik.";
  for (const role of ["ADMIN", "PROJECT_MANAGER", "VIEWER"]) {
    const p = correctionProblems(diajukan, next, catatan, { role, userId: "u" });
    assert.ok(p.some((x) => /Hanya Finance/.test(x)), role);
  }
  // Termasuk Finance yang mengajukan sendiri.
  const p = correctionProblems(diajukan, next, catatan, {
    role: "FINANCE",
    userId: "user-budi",
  });
  assert.ok(p.some((x) => /Anda sendiri yang mengajukan/.test(x)));
});

test("koreksi tidak boleh menghasilkan angka yang mustahil", () => {
  const catatan = "Memperbaiki angka sesuai struk.";
  const nol = { ...correctionFrom(diajukan), amount: 0 };
  assert.ok(correctionProblems(diajukan, nol, catatan, finance).some((p) => /lebih dari nol/.test(p)));
  const pajakNegatif = { ...correctionFrom(diajukan), tax: -1 };
  assert.ok(
    correctionProblems(diajukan, pajakNegatif, catatan, finance).some((p) =>
      /Pajak tidak boleh negatif/.test(p),
    ),
  );
});

/* --- riwayat koreksi dan keputusan --- */

test("riwayat dibaca dari yang paling lama, bukan dari yang terbaru", () => {
  // Berbeda dari antrean: antrean menjawab "apa berikutnya", riwayat
  // menjawab "apa yang sudah terjadi" — dan cerita dibaca dari awal.
  const urut = sortReviewHistory([
    { type: "DITOLAK", at: "2026-09-18T15:30:00+07:00", by: "Direktur" },
    { type: "DIBUAT", at: "2026-09-18T11:00:00+07:00", by: "Budi" },
  ]);
  assert.deepEqual(urut.map((e) => e.type), ["DIBUAT", "DITOLAK"]);
});

test("mengurutkan riwayat tidak mengubah daftar aslinya", () => {
  const events: ReviewEvent[] = [
    { type: "DIAJUKAN", at: "2026-09-02T00:00:00Z", by: "A" },
    { type: "DIBUAT", at: "2026-09-01T00:00:00Z", by: "A" },
  ];
  const salinan = events.map((e) => e.type);
  sortReviewHistory(events);
  assert.deepEqual(events.map((e) => e.type), salinan);
});

test("biaya yang pernah dikoreksi bisa dikenali", () => {
  // Angka yang dilihat peninjau sudah termasuk koreksi itu, dan dia berhak
  // tahu bahwa yang dia baca bukan lagi angka yang diajukan.
  const d = mockExpenseReview().items.find((i) => i.editedFields.includes("amount"))!;
  assert.equal(wasCorrected(d), true);
  assert.equal(wasCorrected(baris({ history: [] })), false);
});

test("peristiwa koreksi membawa nilai sebelum dan sesudahnya", () => {
  // Tanpa itu, baris "dikoreksi peninjau" hanya memberi tahu bahwa sesuatu
  // berubah — dan pertanyaan pertama pembacanya adalah "dari berapa".
  const koreksi = mockExpenseReview()
    .items.flatMap((i) => i.history)
    .find((e) => e.type === "DIKOREKSI")!;
  assert.ok(koreksi.changes && koreksi.changes.length > 0);
  assert.ok(koreksi.note && koreksi.note.length > 10);
});

test("penolakan selalu membawa alasannya di riwayat", () => {
  const tolak = mockExpenseReview()
    .items.flatMap((i) => i.history)
    .filter((e) => e.type === "DITOLAK");
  assert.ok(tolak.length > 0);
  for (const e of tolak) {
    assert.ok(e.note && e.note.length > 10, JSON.stringify(e));
  }
});

test("tiap jenis peristiwa punya label yang bisa dibaca orang", () => {
  for (const key of Object.keys(REVIEW_EVENT_LABEL) as (keyof typeof REVIEW_EVENT_LABEL)[]) {
    assert.ok(REVIEW_EVENT_LABEL[key].length > 3, key);
    assert.notEqual(REVIEW_EVENT_LABEL[key], key);
  }
});
