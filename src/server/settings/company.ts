"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { assertFileAllowed, saveBrandingAsset } from "@/lib/storage";
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
  addressLine2: z.string().optional().nullable(),
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

/**
 * Takes FormData (not JSON) because the Logo and Company Stamp are optional
 * file uploads alongside the text fields — same reason
 * updateUserAction/signature upload does, see server/settings/users.ts.
 * Without an actual logoUrl saved here, every PDF header falls back to a
 * plain "SINERGI" text label instead of the real logo image (spec point #1).
 */
export async function updateCompanySettings(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "settings", "manage");

    const data = companySettingsSchema.parse({
      companyName: formData.get("companyName"),
      address: formData.get("address") || null,
      addressLine2: formData.get("addressLine2") || null,
      city: formData.get("city") || null,
      province: formData.get("province") || null,
      country: formData.get("country") || null,
      phone: formData.get("phone") || null,
      email: formData.get("email") || null,
      taxId: formData.get("taxId") || null,
      currency: formData.get("currency") || "IDR",
      timezone: formData.get("timezone") || "Asia/Jakarta",
      defaultTaxRatePercent: formData.get("defaultTaxRatePercent") || 11,
      bankName: formData.get("bankName") || null,
      bankBranch: formData.get("bankBranch") || null,
      bankAccountName: formData.get("bankAccountName") || null,
      bankAccountNumber: formData.get("bankAccountNumber") || null,
    });

    let logoUrl: string | undefined;
    const logoFile = formData.get("logo");
    if (logoFile instanceof File && logoFile.size > 0) {
      assertFileAllowed(logoFile.name, logoFile.type, logoFile.size);
      const buffer = Buffer.from(await logoFile.arrayBuffer());
      logoUrl = await saveBrandingAsset(buffer, { prefix: "company-logo", originalName: logoFile.name });
    }

    let stampImageUrl: string | undefined;
    const stampFile = formData.get("stamp");
    if (stampFile instanceof File && stampFile.size > 0) {
      assertFileAllowed(stampFile.name, stampFile.type, stampFile.size);
      const buffer = Buffer.from(await stampFile.arrayBuffer());
      stampImageUrl = await saveBrandingAsset(buffer, { prefix: "company-stamp", originalName: stampFile.name });
    }

    await prisma.companySettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data, email: data.email || null, ...(logoUrl ? { logoUrl } : {}), ...(stampImageUrl ? { stampImageUrl } : {}) },
      update: { ...data, email: data.email || null, ...(logoUrl ? { logoUrl } : {}), ...(stampImageUrl ? { stampImageUrl } : {}) },
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
