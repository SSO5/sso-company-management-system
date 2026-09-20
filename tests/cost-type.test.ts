import test from "node:test";
import assert from "node:assert/strict";
import {
  canDeleteCostType,
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
