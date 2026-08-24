import { prisma } from "@/lib/db";
import { notifyRole, notifyUser } from "@/lib/workflows/notify";
import { dispatchOutbound } from "@/lib/notifications/dispatch";
import { formatDate } from "@/lib/utils";

const REMINDER_DEDUPE_DAYS = 3;

function dedupeSince(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Escalates Quotation/Invoice/Vendor PO/Expense that have sat in SUBMITTED
 * (Quotation also counts UNDER_REVIEW) for more than 48 hours with nobody
 * acting on them — only ADMIN (Direktur) can approve these (see
 * permissions.ts requireApprover), so a backlog here is a real bottleneck
 * nothing else in the app surfaces proactively. One combined notification
 * per run, deduped against the last ~20h so a daily cron never double-fires
 * on the same day.
 */
export async function escalateStaleApprovals(): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const dedupeSince = new Date(Date.now() - 20 * 60 * 60 * 1000);

  const [quotations, invoices, vendorPOs, expenses] = await Promise.all([
    prisma.quotation.findMany({
      where: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, submittedAt: { lt: cutoff } },
      select: { number: true, revision: true, submittedAt: true },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null, status: "SUBMITTED", submittedAt: { lt: cutoff } },
      select: { number: true, submittedAt: true },
    }),
    prisma.vendorPurchaseOrder.findMany({
      where: { deletedAt: null, status: "SUBMITTED", submittedAt: { lt: cutoff } },
      select: { number: true, submittedAt: true },
    }),
    prisma.projectExpense.findMany({
      where: { deletedAt: null, approvalStatus: "SUBMITTED", submittedAt: { lt: cutoff } },
      select: { number: true, submittedAt: true },
    }),
  ]);

  const items = [
    ...quotations.map((q) => ({ type: "Quotation", number: `${q.number}${q.revision > 0 ? `.R${q.revision}` : ""}`, submittedAt: q.submittedAt! })),
    ...invoices.map((i) => ({ type: "Invoice", number: i.number, submittedAt: i.submittedAt! })),
    ...vendorPOs.map((p) => ({ type: "Vendor PO", number: p.number, submittedAt: p.submittedAt! })),
    ...expenses.map((e) => ({ type: "Expense", number: e.number, submittedAt: e.submittedAt! })),
  ];
  if (items.length === 0) return 0;

  const alreadyNotified = await prisma.notification.findFirst({
    where: { type: "APPROVAL_SLA_BREACH", createdAt: { gt: dedupeSince } },
  });
  if (alreadyNotified) return 0;

  items.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  const title = `${items.length} approval sudah >48 jam belum diproses`;
  const message = items.map((i) => `- [${i.type}] ${i.number} — submit ${formatDate(i.submittedAt)}`).join("\n");
  const link = "/dashboard";

  await prisma.$transaction((tx) => notifyRole(tx, "ADMIN", { type: "APPROVAL_SLA_BREACH", title, message, link }));
  await dispatchOutbound({ role: "ADMIN" }, { title, message, link }).catch((err) =>
    console.error("[escalateStaleApprovals] dispatchOutbound failed:", err)
  );
  return items.length;
}

/**
 * Reminds FINANCE about issued invoices due within 3 days — everything else
 * about invoices only reacts AFTER the due date passes (refreshOverdueInvoices)
 * or after a PO exists but nothing's been invoiced yet (refreshBillingSchedule).
 * This is the missing "before it's actually late" nudge. One combined
 * notification per run, deduped per invoice against the last 3 days so the
 * daily cron doesn't re-notify the same invoice every single day of its
 * due-soon window.
 */
export async function remindInvoicesDueSoon(): Promise<number> {
  const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const invoices = await prisma.invoice.findMany({
    where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { gte: new Date(), lte: in3Days } },
    select: { number: true, dueDate: true, customer: { select: { companyName: true } } },
  });
  if (invoices.length === 0) return 0;

  const alreadyNotified = await prisma.notification.findFirst({
    where: { type: "INVOICE_DUE_SOON", createdAt: { gt: dedupeSince(REMINDER_DEDUPE_DAYS) } },
  });
  if (alreadyNotified) return 0;

  const title = `${invoices.length} invoice jatuh tempo dalam 3 hari`;
  const message = invoices.map((i) => `- ${i.number} — ${i.customer.companyName} — jatuh tempo ${formatDate(i.dueDate)}`).join("\n");
  const link = "/finance/receivables";

  await prisma.$transaction((tx) => notifyRole(tx, "FINANCE", { type: "INVOICE_DUE_SOON", title, message, link }));
  await dispatchOutbound({ role: "FINANCE" }, { title, message, link }).catch((err) =>
    console.error("[remindInvoicesDueSoon] dispatchOutbound failed:", err)
  );
  return invoices.length;
}

/**
 * Reminds the assigned PM about milestones due within 3 days — everything
 * else about milestone dates only reacts AFTER they've already slipped
 * (refreshDelayedMilestones flips them to DELAYED). One notification per PM
 * (not a single company-wide broadcast — a PM only needs to hear about
 * their own projects), deduped per PM against the last 3 days. Milestones
 * with no PM assigned yet are skipped — nobody to notify.
 */
export async function remindMilestonesDueSoon(): Promise<number> {
  const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const milestones = await prisma.projectMilestone.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      dueDate: { gte: new Date(), lte: in3Days },
      project: { deletedAt: null, projectManagerId: { not: null } },
    },
    select: { name: true, dueDate: true, project: { select: { number: true, name: true, projectManagerId: true } } },
  });
  if (milestones.length === 0) return 0;

  const byPm = new Map<string, typeof milestones>();
  for (const m of milestones) {
    const pmId = m.project.projectManagerId!;
    byPm.set(pmId, [...(byPm.get(pmId) ?? []), m]);
  }

  let notifiedCount = 0;
  for (const [pmId, items] of byPm) {
    const alreadyNotified = await prisma.notification.findFirst({
      where: { type: "MILESTONE_DUE_SOON", userId: pmId, createdAt: { gt: dedupeSince(REMINDER_DEDUPE_DAYS) } },
    });
    if (alreadyNotified) continue;

    const title = `${items.length} milestone jatuh tempo dalam 3 hari`;
    const message = items.map((m) => `- ${m.project.number} — ${m.name} — target ${formatDate(m.dueDate)}`).join("\n");
    const link = "/projects";

    await prisma.$transaction((tx) => notifyUser(tx, { userId: pmId, type: "MILESTONE_DUE_SOON", title, message, link }));
    await dispatchOutbound({ userId: pmId }, { title, message, link }).catch((err) =>
      console.error("[remindMilestonesDueSoon] dispatchOutbound failed:", err)
    );
    notifiedCount += items.length;
  }
  return notifiedCount;
}

/**
 * Reminds SALES about ACTIVE contracts expiring within 14 days — there was
 * no signal at all before this that a contract was about to lapse. One
 * combined notification per run, deduped against the last 3 days.
 */
export async function remindContractsExpiringSoon(): Promise<number> {
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const contracts = await prisma.contract.findMany({
    where: { deletedAt: null, status: "ACTIVE", endDate: { gte: new Date(), lte: in14Days } },
    select: { number: true, endDate: true, customer: { select: { companyName: true } } },
  });
  if (contracts.length === 0) return 0;

  const alreadyNotified = await prisma.notification.findFirst({
    where: { type: "CONTRACT_EXPIRING_SOON", createdAt: { gt: dedupeSince(REMINDER_DEDUPE_DAYS) } },
  });
  if (alreadyNotified) return 0;

  const title = `${contracts.length} kontrak berakhir dalam 14 hari`;
  const message = contracts.map((c) => `- ${c.number} — ${c.customer.companyName} — berakhir ${formatDate(c.endDate)}`).join("\n");
  const link = "/sales/contracts";

  await prisma.$transaction((tx) => notifyRole(tx, "SALES", { type: "CONTRACT_EXPIRING_SOON", title, message, link }));
  await dispatchOutbound({ role: "SALES" }, { title, message, link }).catch((err) =>
    console.error("[remindContractsExpiringSoon] dispatchOutbound failed:", err)
  );
  return contracts.length;
}

/**
 * Reminds each Sales PIC about their own quotations nearing validUntil
 * within 3 days and still not WON/LOST/EXPIRED/CANCELLED — a personal
 * follow-up nudge rather than a broadcast, since it's that person's deal to
 * chase. Deduped per salesPic against the last 3 days.
 */
export async function remindQuotationsExpiringSoon(): Promise<number> {
  const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const quotations = await prisma.quotation.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["WON", "LOST", "EXPIRED", "CANCELLED", "DRAFT"] },
      validUntil: { gte: new Date(), lte: in3Days },
    },
    select: { number: true, revision: true, validUntil: true, salesPicId: true, customer: { select: { companyName: true } } },
  });
  if (quotations.length === 0) return 0;

  const byPic = new Map<string, typeof quotations>();
  for (const q of quotations) {
    byPic.set(q.salesPicId, [...(byPic.get(q.salesPicId) ?? []), q]);
  }

  let notifiedCount = 0;
  for (const [picId, items] of byPic) {
    const alreadyNotified = await prisma.notification.findFirst({
      where: { type: "QUOTATION_EXPIRING_SOON", userId: picId, createdAt: { gt: dedupeSince(REMINDER_DEDUPE_DAYS) } },
    });
    if (alreadyNotified) continue;

    const title = `${items.length} quotation Anda mendekati masa berlaku`;
    const message = items
      .map((q) => `- ${q.number}${q.revision > 0 ? `.R${q.revision}` : ""} — ${q.customer.companyName} — berlaku sampai ${formatDate(q.validUntil!)}`)
      .join("\n");
    const link = "/sales/quotations";

    await prisma.$transaction((tx) => notifyUser(tx, { userId: picId, type: "QUOTATION_EXPIRING_SOON", title, message, link }));
    await dispatchOutbound({ userId: picId }, { title, message, link }).catch((err) =>
      console.error("[remindQuotationsExpiringSoon] dispatchOutbound failed:", err)
    );
    notifiedCount += items.length;
  }
  return notifiedCount;
}

/**
 * One combined "how's the business today" push to ADMIN (Direktur) — the
 * closest thing to an executive digest that doesn't require opening the
 * app. Deliberately skips sending anything on a fully-quiet day (nothing
 * overdue, no risk, no approval backlog): a WA message every morning
 * saying "0, 0, 0" trains people to ignore the channel.
 */
export async function sendDailyDigest(): Promise<boolean> {
  const [overdueInvoices, atRiskProjects, submittedQuotations, submittedInvoices, submittedVendorPOs, submittedExpenses, staleTrashCount] =
    await Promise.all([
      prisma.invoice.findMany({ where: { deletedAt: null, status: "OVERDUE" }, select: { grandTotal: true, paidAmount: true, withholdingTax: true } }),
      prisma.project.count({ where: { deletedAt: null, status: "AT_RISK" } }),
      prisma.quotation.count({ where: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      prisma.invoice.count({ where: { deletedAt: null, status: "SUBMITTED" } }),
      prisma.vendorPurchaseOrder.count({ where: { deletedAt: null, status: "SUBMITTED" } }),
      prisma.projectExpense.count({ where: { deletedAt: null, approvalStatus: "SUBMITTED" } }),
      // Visibility only — nothing here is ever auto-deleted. A human still
      // has to review and permanently purge from the Trash UI; this just
      // stops old trashed files from being silently forgotten forever.
      prisma.document.count({ where: { deletedAt: { lt: dedupeSince(30) } } }),
    ]);

  const totalOverdue = overdueInvoices.reduce((s, i) => s + (Number(i.grandTotal) - Number(i.paidAmount) - Number(i.withholdingTax)), 0);
  const totalPendingApprovals = submittedQuotations + submittedInvoices + submittedVendorPOs + submittedExpenses;

  if (overdueInvoices.length === 0 && atRiskProjects === 0 && totalPendingApprovals === 0 && staleTrashCount === 0) return false;

  const title = "Ringkasan harian SSO Connect";
  const message =
    `Invoice overdue: ${overdueInvoices.length} (Rp ${totalOverdue.toLocaleString("id-ID")})\n` +
    `Project berisiko (AT_RISK): ${atRiskProjects}\n` +
    `Approval menunggu: ${totalPendingApprovals}` +
    (staleTrashCount > 0 ? `\nDokumen di Trash >30 hari: ${staleTrashCount} (review manual, tidak dihapus otomatis)` : "");
  const link = "/dashboard";

  await prisma.$transaction((tx) => notifyRole(tx, "ADMIN", { type: "DAILY_DIGEST", title, message, link }));
  await dispatchOutbound({ role: "ADMIN" }, { title, message, link }).catch((err) =>
    console.error("[sendDailyDigest] dispatchOutbound failed:", err)
  );
  return true;
}

// How many pending Directive rows one run sends — kept small on purpose.
// This job runs every ~5 minutes (see api/cron/directives), so a broadcast
// to e.g. 8-10 people spreads across several ticks instead of firing all at
// once, which is the exact pattern that gets a WhatsApp number flagged.
const DIRECTIVE_DISPATCH_BATCH_SIZE = 2;
// Short gap between the (at most two) sends within a single run — the real
// spacing comes from the cron interval itself, not from sleeping in-request
// (a long in-request sleep risks the serverless function timing out).
const DIRECTIVE_DISPATCH_INTRA_BATCH_DELAY_MS = 4000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drains queued "Tugas dari Direktur" notifications (createDirectiveAction
 * deliberately does NOT send WA/email itself — see its own comment) a
 * couple at a time, oldest first. Every recipient still gets their own
 * deep-linked message (/tasks?open=<id>); this only changes WHEN it's sent,
 * not who it goes to or what it says.
 */
export async function dispatchPendingDirectiveNotifications(): Promise<number> {
  const pending = await prisma.directive.findMany({
    where: { notifiedAt: null },
    orderBy: { createdAt: "asc" },
    take: DIRECTIVE_DISPATCH_BATCH_SIZE,
    select: { id: true, title: true, description: true, assignedToId: true },
  });
  if (pending.length === 0) return 0;

  let sent = 0;
  for (const row of pending) {
    try {
      await dispatchOutbound(
        { userId: row.assignedToId },
        {
          title: "Tugas baru dari Direktur",
          message: row.title + (row.description ? `\n${row.description}` : ""),
          link: `/tasks?open=${row.id}`,
        }
      );
      await prisma.directive.update({ where: { id: row.id }, data: { notifiedAt: new Date() } });
      sent++;
    } catch (err) {
      console.error(`[dispatchPendingDirectiveNotifications] failed for directive ${row.id}:`, err);
    }
    if (row !== pending[pending.length - 1]) await sleep(DIRECTIVE_DISPATCH_INTRA_BATCH_DELAY_MS);
  }
  return sent;
}
