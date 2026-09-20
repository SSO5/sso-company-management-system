"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { parseCostType } from "@/lib/validation/cost-type";
import { logActivity } from "@/lib/workflows/audit";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import {
  filterCostTypes,
  sortCostTypes,
  type CostType,
  type CostTypeFilter,
} from "@/lib/cost-type";

/**
 * Daftar jenis biaya, siap tampil.
 *
 * Penyaringan dikerjakan filterCostTypes() yang murni dan diuji terpisah,
 * BUKAN di dalam kueri. Alasannya bukan kemalasan: daftar jenis biaya satu
 * perusahaan berjumlah puluhan, bukan puluhan ribu, jadi menyaring di memori
 * lebih murah daripada satu kueri tambahan — dan yang lebih penting, layar
 * dan uji jadi memakai aturan penyaringan yang sama persis. Kalau daftarnya
 * kelak membengkak, kueri yang berubah, bukan aturannya.
 *
 * usageCount dihitung dari jumlah ProjectExpense yang memakai jenis ini,
 * termasuk yang sudah dihapus lunak. Itu disengaja: biaya yang di-soft delete
 * masih bisa dipulihkan, dan jenis yang dihapus sementara itu akan membuat
 * pemulihannya kehilangan pengelompokan.
 */
export async function listCostTypes(
  filter: CostTypeFilter = {},
): Promise<CostType[]> {
  const actor = await requireUserOrThrow();
  // Hak mengikuti Bagan Akun, bukan "settings": tiap jenis biaya dipetakan ke
  // satu akun, dan peran FINANCE sama sekali tidak punya hak "settings" —
  // memakainya akan membuat akuntan internal terkunci dari daftarnya sendiri.
  requirePermission(actor.role, "finance", "view");

  const rows = await prisma.costType.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      category: true,
      isActive: true,
      chartOfAccount: { select: { code: true, name: true } },
      _count: { select: { expenses: true } },
    },
  });

  const types: CostType[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    category: r.category,
    accountCode: r.chartOfAccount?.code ?? null,
    accountName: r.chartOfAccount?.name ?? null,
    isActive: r.isActive,
    usageCount: r._count.expenses,
  }));

  return sortCostTypes(filterCostTypes(types, filter));
}

/**
 * Jenis biaya yang boleh dipilih saat mencatat biaya baru.
 *
 * Jalur terpisah karena dipakai di form pencatatan biaya, bukan di halaman
 * pengaturan: ia hanya butuh yang aktif, tidak butuh usageCount, dan haknya
 * mengikuti hak mencatat biaya — bukan hak mengubah pengaturan.
 */
export async function listSelectableCostTypes(): Promise<
  { id: string; code: string; name: string; category: CostType["category"] }[]
> {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");

  return prisma.costType.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, category: true },
  });
}

/**
 * Menyimpan satu jenis biaya, baru atau yang sudah ada.
 *
 * Tiga hal yang dijaga di sini dan tidak bisa dijaga di form:
 *
 *   1. KODE UNIK. Dijaga basis data lewat indeks unik, tapi galatnya
 *      diterjemahkan jadi kalimat yang menyebut kode bentrokannya. Pesan
 *      Prisma mentah ("Unique constraint failed on the fields: (`code`)")
 *      tidak memberi tahu siapa pun kode apa yang bentrok.
 *   2. AKUN YANG DIPILIH HARUS ADA DAN AKTIF. Daftar akun di form bisa basi
 *      kalau seseorang menonaktifkan akun sementara form terbuka.
 *   3. MENGUBAH KODE JENIS YANG SUDAH DIPAKAI. Diizinkan — kode hanyalah
 *      label, dan biaya lama menunjuk lewat id, bukan lewat kode. Tapi
 *      dicatat di log aktivitas, karena laporan lama yang dicetak memakai
 *      kode lama akan terlihat berbeda dari layar.
 */
export async function saveCostTypeAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    // Sama dengan mengubah Bagan Akun: Admin dan akuntan internal.
    requirePermission(actor.role, "finance", "manage");

    const data = parseCostType(input);

    if (data.chartOfAccountId) {
      const akun = await prisma.chartOfAccount.findFirst({
        where: { id: data.chartOfAccountId, isActive: true },
        select: { id: true },
      });
      if (!akun) {
        throw new Error(
          "Akun yang dipilih sudah tidak ada atau sudah dinonaktifkan. Muat ulang halaman lalu pilih akun lain.",
        );
      }
    }

    const bentrok = await prisma.costType.findFirst({
      where: { code: data.code, ...(id ? { NOT: { id } } : {}) },
      select: { id: true, name: true },
    });
    if (bentrok) {
      throw new Error(
        `Kode ${data.code} sudah dipakai oleh "${bentrok.name}". Pakai kode lain.`,
      );
    }

    const saved = await prisma.$transaction(async (tx) => {
      if (!id) {
        const created = await tx.costType.create({ data });
        await logActivity(tx, {
          userId: actor.userId,
          action: "CREATE",
          entityType: "COST_TYPE",
          entityId: created.id,
          description: `Menambah jenis biaya ${created.code} (${created.name})`,
        });
        return created;
      }

      const sebelum = await tx.costType.findUniqueOrThrow({
        where: { id },
        select: { code: true, name: true },
      });
      const updated = await tx.costType.update({ where: { id }, data });

      // Perubahan kode dicatat terpisah: laporan lama yang sudah dicetak
      // memakai kode lama akan terlihat berbeda dari layar, dan orang perlu
      // bisa menelusuri kenapa.
      const kodeBerubah = sebelum.code !== updated.code;
      await logActivity(tx, {
        userId: actor.userId,
        action: "UPDATE",
        entityType: "COST_TYPE",
        entityId: updated.id,
        description: kodeBerubah
          ? `Mengubah jenis biaya ${sebelum.code} menjadi ${updated.code} (${updated.name})`
          : `Memperbarui jenis biaya ${updated.code} (${updated.name})`,
        metadata: kodeBerubah
          ? { kodeLama: sebelum.code, kodeBaru: updated.code }
          : undefined,
      });
      return updated;
    });

    revalidatePath("/settings/cost-types");
    return { id: saved.id };
  });
}

/**
 * Menyalakan atau mematikan satu jenis biaya.
 *
 * Dipisah dari saveCostTypeAction karena keduanya dipakai dengan cara yang
 * berbeda: menyunting adalah pekerjaan sadar di dalam form, sedangkan
 * menonaktifkan dilakukan sambil lalu dari daftar. Memaksa orang membuka
 * form hanya untuk mematikan satu baris akan membuat daftar yang sudah usang
 * dibiarkan begitu saja.
 *
 * Menonaktifkan BUKAN menghapus. Biaya lama tetap memegang jenis ini; yang
 * berubah hanya bahwa ia tidak lagi ditawarkan saat mencatat biaya baru.
 *
 * Seperti saveCostTypeAction, tahap ini belum menulis ke basis data dan
 * mengatakannya apa adanya.
 */
export async function setCostTypeActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "manage");

    if (!id) throw new Error("Jenis biaya tidak dikenal.");

    throw new Error(
      `Permintaan ${isActive ? "mengaktifkan" : "menonaktifkan"} jenis biaya ` +
        "sudah benar, tapi penyimpanan belum tersambung. Tabel jenis biaya " +
        "dibuat pada tahap backend.",
    );
  });
}
