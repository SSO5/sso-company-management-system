import { prisma } from "@/lib/db";
import { notifyRole } from "@/lib/workflows/notify";
import { dispatchOutbound } from "@/lib/notifications/dispatch";
import { formatDate } from "@/lib/utils";

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
 * One combined "how's the business today" push to ADMIN (Direktur) — the
 * closest thing to an executive digest that doesn't require opening the
 * app. Deliberately skips sending anything on a fully-quiet day (nothing
 * overdue, no risk, no approval backlog): a WA message every morning
 * saying "0, 0, 0" trains people to ignore the channel.
 */
export async function sendDailyDigest(): Promise<boolean> {
  const [overdueInvoices, atRiskProjects, submittedQuotations, submittedInvoices, submittedVendorPOs, submittedExpenses] = await Promise.all([
    prisma.invoice.findMany({ where: { deletedAt: null, status: "OVERDUE" }, select: { grandTotal: true, paidAmount: true, withholdingTax: true } }),
    prisma.project.count({ where: { deletedAt: null, status: "AT_RISK" } }),
    prisma.quotation.count({ where: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.invoice.count({ where: { deletedAt: null, status: "SUBMITTED" } }),
    prisma.vendorPurchaseOrder.count({ where: { deletedAt: null, status: "SUBMITTED" } }),
    prisma.projectExpense.count({ where: { deletedAt: null, approvalStatus: "SUBMITTED" } }),
  ]);

  const totalOverdue = overdueInvoices.reduce((s, i) => s + (Number(i.grandTotal) - Number(i.paidAmount) - Number(i.withholdingTax)), 0);
  const totalPendingApprovals = submittedQuotations + submittedInvoices + submittedVendorPOs + submittedExpenses;

  if (overdueInvoices.length === 0 && atRiskProjects === 0 && totalPendingApprovals === 0) return false;

  const title = "Ringkasan harian SSO Connect";
  const message =
    `Invoice overdue: ${overdueInvoices.length} (Rp ${totalOverdue.toLocaleString("id-ID")})\n` +
    `Project berisiko (AT_RISK): ${atRiskProjects}\n` +
    `Approval menunggu: ${totalPendingApprovals}`;
  const link = "/dashboard";

  await prisma.$transaction((tx) => notifyRole(tx, "ADMIN", { type: "DAILY_DIGEST", title, message, link }));
  await dispatchOutbound({ role: "ADMIN" }, { title, message, link }).catch((err) =>
    console.error("[sendDailyDigest] dispatchOutbound failed:", err)
  );
  return true;
}
