"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { UI_MOODS } from "@/lib/ui-moods";
import { z } from "zod";

/**
 * "Suasana" is a personal, self-service preference — every signed-in user
 * can set their OWN mood, no permission gate beyond being logged in
 * (unlike Settings > Tema, which is Admin-only and company-wide). Picking
 * one only ever changes what the picker's own account sees.
 */
const moodIds = UI_MOODS.map((m) => m.id) as [string, ...string[]];
const moodSchema = z.enum(moodIds);

export async function updateMyMoodAction(mood: string): Promise<ActionResult<{ mood: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const data = moodSchema.parse(mood);

    await prisma.user.update({
      where: { id: actor.userId },
      data: { uiMood: data },
    });

    // Every authenticated route re-reads uiMood in (app)/layout.tsx on each
    // request, so a blanket revalidate of the app segment is enough to
    // reflect the new mood immediately without listing every page.
    revalidatePath("/", "layout");
    return { mood: data };
  });
}
