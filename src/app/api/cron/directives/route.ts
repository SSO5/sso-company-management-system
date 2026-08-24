import { NextResponse } from "next/server";
import { dispatchPendingDirectiveNotifications } from "@/lib/workflows/cron-jobs";

export const dynamic = "force-dynamic";

/**
 * Drains the "Tugas dari Direktur" WA/email queue a couple recipients at a
 * time — see dispatchPendingDirectiveNotifications()'s own comment for why
 * this is a separate, much more frequent cron (~every 5 minutes) instead of
 * being folded into /api/cron/daily: a broadcast must NOT send every
 * recipient's WA message in the same instant, since that burst pattern is
 * what gets a WhatsApp number flagged/blocked by Meta.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment." }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sent = await dispatchPendingDirectiveNotifications();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), sent });
  } catch (err) {
    console.error("[cron/directives] failed:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
