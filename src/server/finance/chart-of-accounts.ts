"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { chartOfAccountSchema } from "@/lib/validation/finance";
import { logActivity } from "@/lib/workflows/audit";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { revalidatePath } from "next/cache";

/**
 * Chart of Accounts — Phase 1 of the General Ledger. Gated on the existing
 * "finance" module "manage" grant (ADMIN and FINANCE already hold it — this
 * matches exactly who the founder said should own the COA: himself and the
 * internal accountant, no new role needed).
 */
export async function listChartOfAccounts() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "finance", "view");
  return prisma.chartOfAccount.findMany({ orderBy: { code: "asc" } });
}

export async function createChartOfAccountAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "manage");
    const data = chartOfAccountSchema.parse(input);

    const account = await prisma.$transaction(async (tx) => {
      const existing = await tx.chartOfAccount.findUnique({ where: { code: data.code } });
      if (existing) throw new Error(`Kode akun "${data.code}" sudah dipakai.`);
      const created = await tx.chartOfAccount.create({ data });
      await logActivity(tx, {
        userId: actor.userId, action: "CREATE", entityType: "CHART_OF_ACCOUNT", entityId: created.id,
        description: `Akun baru dibuat: ${created.code} - ${created.name} (${created.type})`,
      });
      return created;
    });

    revalidatePath("/settings/chart-of-accounts");
    return { id: account.id };
  });
}

export async function updateChartOfAccountAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "manage");
    const data = chartOfAccountSchema.parse(input);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.chartOfAccount.findUnique({ where: { code: data.code } });
      if (existing && existing.id !== id) throw new Error(`Kode akun "${data.code}" sudah dipakai akun lain.`);
      const updated = await tx.chartOfAccount.update({ where: { id }, data });
      await logActivity(tx, {
        userId: actor.userId, action: "UPDATE", entityType: "CHART_OF_ACCOUNT", entityId: id,
        description: `Akun diperbarui: ${updated.code} - ${updated.name}`,
      });
    });

    revalidatePath("/settings/chart-of-accounts");
    return { id };
  });
}
