import { NextResponse } from "next/server";
import { refreshOverdueInvoices, refreshBillingSchedule } from "@/lib/workflows/finance";
import { refreshProjectRiskNotifications } from "@/lib/workflows/project";
import { escalateStaleApprovals, sendDailyDigest } from "@/lib/workflows/cron-jobs";

export const dynamic = "force-dynamic";

/**
 * Single daily automation entry point, meant to be hit by a scheduled
 * GitHub Actions workflow (see .github/workflows/cron-daily.yml) — nothing
 * in this app runs itself otherwise; every one of these jobs was previously
 * "safe to call on page load" and therefore only ran when a human happened
 * to open the right page (see refreshOverdueInvoices/refreshBillingSchedule/
 * refreshProjectRiskNotifications's own doc comments).
 *
 * Each job is wrapped individually so one failing (e.g. a transient DB
 * hiccup) never blocks the rest from running.
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

  const results: Record<string, unknown> = {};

  const jobs: [string, () => Promise<unknown>][] = [
    ["overdueInvoices", refreshOverdueInvoices],
    ["billingSchedule", refreshBillingSchedule],
    ["projectRisk", refreshProjectRiskNotifications],
    ["staleApprovals", escalateStaleApprovals],
    ["dailyDigest", sendDailyDigest],
  ];

  for (const [name, job] of jobs) {
    try {
      results[name] = await job();
    } catch (err) {
      console.error(`[cron/daily] ${name} failed:`, err);
      results[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
