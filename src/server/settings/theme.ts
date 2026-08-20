"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { assertFileAllowed, saveBrandingAsset } from "@/lib/storage";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { z } from "zod";

/** Read by (app)/layout.tsx on every request to drive the theme CSS
 * override and the dashboard's background band — cheap singleton lookup,
 * same pattern as getCompanySettings(). */
export async function getThemeSettings() {
  await requireUserOrThrow();
  const settings = await prisma.companySettings.findUnique({
    where: { id: "singleton" },
    select: { themePreset: true, dashboardBackgroundUrl: true },
  });
  return settings ?? { themePreset: "navy", dashboardBackgroundUrl: null };
}

const themePresetIds = THEME_PRESETS.map((p) => p.id) as [string, ...string[]];
const themeSchema = z.object({
  themePreset: z.enum(themePresetIds),
});

/**
 * Takes FormData because the background photo is an optional file upload
 * alongside the preset choice — same reason updateCompanySettings does.
 * Admin-only ("settings","manage"), same gate as company branding: this is
 * an app-wide look, not a per-user preference.
 */
export async function updateThemeSettings(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "settings", "manage");

    const data = themeSchema.parse({ themePreset: formData.get("themePreset") });

    let dashboardBackgroundUrl: string | undefined;
    const bgFile = formData.get("background");
    if (bgFile instanceof File && bgFile.size > 0) {
      assertFileAllowed(bgFile.name, bgFile.type, bgFile.size);
      const buffer = Buffer.from(await bgFile.arrayBuffer());
      dashboardBackgroundUrl = await saveBrandingAsset(buffer, { prefix: "dashboard-background", originalName: bgFile.name });
    }

    // Explicit "Hapus" checkbox rather than inferring removal from "no new
    // file chosen" — the far more common case on a re-save is "keep what's
    // already there", which an absent file input would otherwise wipe.
    const removeBackground = formData.get("removeBackground") === "on";

    await prisma.companySettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        themePreset: data.themePreset,
        ...(dashboardBackgroundUrl ? { dashboardBackgroundUrl } : {}),
      },
      update: {
        themePreset: data.themePreset,
        ...(dashboardBackgroundUrl ? { dashboardBackgroundUrl } : removeBackground ? { dashboardBackgroundUrl: null } : {}),
      },
    });

    revalidatePath("/settings/theme");
    revalidatePath("/dashboard");
    return { id: "singleton" };
  });
}
