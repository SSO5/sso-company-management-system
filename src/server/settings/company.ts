"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { z } from "zod";

export async function getCompanySettings() {
  await requireUserOrThrow();
  const settings = await prisma.companySettings.findUnique({ where: { id: "singleton" } });
  if (settings) return settings;
  return prisma.companySettings.create({ data: { id: "singleton" } });
}

const companySettingsSchema = z.object({
  companyName: z.string().min(2),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  taxId: z.string().optional().nullable(),
  currency: z.string().default("IDR"),
  timezone: z.string().default("Asia/Jakarta"),
  defaultTaxRatePercent: z.coerce.number().min(0).max(100).default(11),
  // "PAYMENT INSTRUCTIONS" bank block printed on the Invoice PDF.
  bankName: z.string().optional().nullable(),
  bankBranch: z.string().optional().nullable(),
  bankAccountName: z.string().optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
});

export async function updateCompanySettings(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "settings", "manage");
    const data = companySettingsSchema.parse(input);
    await prisma.companySettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data, email: data.email || null },
      update: { ...data, email: data.email || null },
    });
    revalidatePath("/settings/company");
    return { id: "singleton" };
  });
}

const numberingSchema = z.object({
  customerPrefix: z.string().min(1),
  leadPrefix: z.string().min(1),
  opportunityPrefix: z.string().min(1),
  quotationPrefix: z.string().min(1),
  poPrefix: z.string().min(1),
  contractPrefix: z.string().min(1),
  projectPrefix: z.string().min(1),
  invoicePrefix: z.string().min(1),
  paymentPrefix: z.string().min(1),
  expensePrefix: z.string().min(1),
  costingPrefix: z.string().min(1),
  vendorPoPrefix: z.string().min(1),
  numberPadding: z.coerce.number().int().min(2).max(8),
});

/**
 * Prefix/padding are configurable (section 5), but the running counter
 * itself (NumberSequence.currentNumber) is NEVER exposed for editing here —
 * only lib/numbering.ts's generateNumber() may increment it.
 */
export async function updateNumberingSettings(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "settings", "manage");
    const data = numberingSchema.parse(input);
    await prisma.companySettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: data,
    });
    revalidatePath("/settings/numbering");
    return { id: "singleton" };
  });
}
