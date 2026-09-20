import test from "node:test";
import assert from "node:assert/strict";
import { can } from "../src/lib/permissions";
import type { UserRole } from "@prisma/client";
import {
  canDeleteCostType,
  filterCostTypes,
  parseCostTypeFilter,
  mockCostTypes,
  selectableCostTypes,
  sortCostTypes,
  unmappedCostTypes,
  type CostType,
} from "../src/lib/cost-type";

const jenis = (over: Partial<CostType> = {}): CostType => ({
  id: "ct-x",
  code: "KODE",
  name: "Nama",
  description: null,
  category: "OTHER",
  accountCode: "5-901",
  accountName: "Beban Lain-lain",
  isActive: true,
  usageCount: 0,
  ...over,
});

test("jenis nonaktif tidak boleh muncul saat mencatat biaya baru", () => {
  const types = [jenis({ id: "a" }), jenis({ id: "b", isActive: false })];
  assert.deepEqual(
    selectableCostTypes(types).map((t) => t.id),
    ["a"],
  );
});

test("jenis yang sudah dipakai tidak boleh dihapus, hanya dinonaktifkan", () => {
  // Menghapusnya membuat biaya lama kehilangan pengelompokannya diam-diam.
  assert.equal(canDeleteCostType(jenis({ usageCount: 0 })), true);
  assert.equal(canDeleteCostType(jenis({ usageCount: 1 })), false);
  // Termasuk yang sudah dinonaktifkan: riwayatnya tetap menempel.
  assert.equal(
    canDeleteCostType(jenis({ usageCount: 21, isActive: false })),
    false,
  );
});

test("hanya jenis aktif yang dihitung belum dipetakan", () => {
  // Jenis nonaktif tanpa akun bukan pekerjaan yang tertunda — ia memang
  // sudah tidak dipakai.
  const types = [
    jenis({ id: "a", accountCode: null, accountName: null }),
    jenis({ id: "b", accountCode: null, accountName: null, isActive: false }),
    jenis({ id: "c" }),
  ];
  assert.deepEqual(
    unmappedCostTypes(types).map((t) => t.id),
    ["a"],
  );
});

test("yang belum dipetakan naik ke atas, yang nonaktif turun ke bawah", () => {
  // Mengurutkan menurut kode saja akan mengubur pekerjaan yang belum selesai
  // di tengah daftar.
  const types = [
    jenis({ id: "zzz-aktif", code: "ZZZ" }),
    jenis({ id: "nonaktif", code: "AAA", isActive: false }),
    jenis({ id: "belum", code: "MMM", accountCode: null, accountName: null }),
    jenis({ id: "aaa-aktif", code: "AAB" }),
  ];
  assert.deepEqual(
    sortCostTypes(types).map((t) => t.id),
    ["belum", "aaa-aktif", "zzz-aktif", "nonaktif"],
  );
});

test("pengurutan tidak mengubah daftar aslinya", () => {
  const types = [jenis({ id: "b", code: "B" }), jenis({ id: "a", code: "A" })];
  const salinan = [...types];
  sortCostTypes(types);
  assert.deepEqual(types, salinan);
});

test("data tiruan memuat kasus yang perlu terlihat di layar", () => {
  const types = mockCostTypes();
  // Minimal satu belum dipetakan dan satu nonaktif, supaya kedua keadaan itu
  // benar-benar bisa diklik saat tampilannya diuji.
  assert.ok(unmappedCostTypes(types).length > 0);
  assert.ok(types.some((t) => !t.isActive));
  // Dan satu yang belum pernah dipakai, supaya keadaan "masih boleh dihapus"
  // ikut terlihat.
  assert.ok(types.some((t) => canDeleteCostType(t)));
});

test("menonaktifkan tidak mengubah riwayat pemakaian", () => {
  // Nonaktif bukan hapus: biaya lama tetap memegang jenis ini, jadi
  // usageCount tidak boleh ikut berubah dan tombol hapus tetap terlarang.
  const terpakai = jenis({ usageCount: 21, isActive: true });
  const setelahNonaktif = { ...terpakai, isActive: false };
  assert.equal(setelahNonaktif.usageCount, terpakai.usageCount);
  assert.equal(canDeleteCostType(setelahNonaktif), false);
});

test("jenis nonaktif hilang dari pilihan, bukan dari daftar master", () => {
  const types = [jenis({ id: "a" }), jenis({ id: "b", isActive: false })];
  assert.equal(selectableCostTypes(types).length, 1);
  // Daftar masternya tetap utuh — pengelola masih harus bisa melihat dan
  // mengaktifkannya kembali.
  assert.equal(sortCostTypes(types).length, 2);
});

test("pencarian menyentuh kode akun, bukan hanya nama", () => {
  // Pertanyaan yang sering muncul bukan "mana jenis bernama X" melainkan
  // "jenis apa saja yang masuk ke akun 5-101".
  const hasil = filterCostTypes(mockCostTypes(), { q: "5-101" });
  assert.ok(hasil.length > 0);
  assert.ok(hasil.every((t) => t.accountCode === "5-101"));
});

test("pencarian tidak peduli besar kecil huruf dan spasi berlebih", () => {
  const types = [jenis({ id: "a", code: "MAT-PANEL", name: "Material panel" })];
  for (const q of ["mat-panel", "  MAT-PANEL ", "material"]) {
    assert.equal(filterCostTypes(types, { q }).length, 1, q);
  }
});

test("saringan belum dipetakan berdiri sendiri dari status aktif", () => {
  // Belum dipetakan adalah pekerjaan tertunda, bukan keadaan hidup-mati.
  const types = [
    jenis({ id: "belum", accountCode: null, accountName: null }),
    jenis({ id: "nonaktif-belum", accountCode: null, accountName: null, isActive: false }),
    jenis({ id: "aktif" }),
  ];
  assert.deepEqual(
    filterCostTypes(types, { status: "UNMAPPED" }).map((t) => t.id),
    ["belum"],
  );
  assert.deepEqual(
    filterCostTypes(types, { status: "INACTIVE" }).map((t) => t.id),
    ["nonaktif-belum"],
  );
});

test("saringan kosong mengembalikan seluruh daftar", () => {
  const types = mockCostTypes();
  assert.equal(filterCostTypes(types, {}).length, types.length);
  assert.equal(filterCostTypes(types, { q: "   ", status: "ALL" }).length, types.length);
});

test("status yang tidak dikenal di URL jatuh ke ALL, bukan menyaring habis", () => {
  // URL bisa diketik orang atau basi setelah rilis; menyaring habis akan
  // terlihat seperti daftar kosong.
  assert.equal(parseCostTypeFilter({ status: "ENTAH" }).status, "ALL");
  assert.equal(parseCostTypeFilter({}).status, "ALL");
  assert.equal(parseCostTypeFilter({ status: "UNMAPPED" }).status, "UNMAPPED");
});

test("hak jenis biaya mengikuti Bagan Akun, bukan pengaturan", () => {
  // Peran FINANCE sama sekali tidak punya hak "settings". Memakai kunci itu
  // akan mengunci akuntan internal dari daftarnya sendiri, padahal dialah
  // pemiliknya bersama Admin.
  assert.equal(can("FINANCE", "settings", "view"), false);
  assert.equal(can("FINANCE", "finance", "view"), true);
  assert.equal(can("FINANCE", "finance", "manage"), true);
  assert.equal(can("ADMIN", "finance", "manage"), true);

  // Yang bukan pemilik boleh melihat, tidak boleh mengubah — sama persis
  // dengan aturan Bagan Akun di sebelahnya.
  for (const role of ["SALES", "PROJECT_MANAGER", "VIEWER"] as UserRole[]) {
    assert.equal(can(role, "finance", "view"), true, role);
    assert.equal(can(role, "finance", "manage"), false, role);
  }
});
