// NOTE: deliberately no "server-only" import here (see whatsapp.ts/email.ts
// for the same note) — this module is only ever reached from workflows/*.ts
// (server-side business logic), never from a client component, but the
// "server-only" package itself unconditionally throws when loaded outside
// Next.js's webpack pipeline (e.g. `tsx prisma/seed.ts`), which broke
// `npm run db:seed` entirely. Next.js's own server/client boundary checks
// (the "use server"/"use client" directives elsewhere) already prevent this
// from leaking into client bundles, so this marker was redundant anyway.
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { notifyRole } from "@/lib/workflows/notify";
import type { UserRole } from "@prisma/client";

/**
 * Unified outbound dispatch (email + WhatsApp) for a notification event —
 * the "who to reach" layer sitting on top of email.ts/whatsapp.ts's "how to
 * reach". Deliberately kept OUTSIDE every Prisma $transaction: this makes
 * two external HTTP calls per recipient, and the Won-transaction timeout
 * bug (see lib/db.ts's comment) already proved that external round-trips
 * inside an interactive transaction risk "Transaction already closed" on a
 * remote DB. Every call site must invoke this AFTER its transaction has
 * committed — never from inside a `prisma.$transaction(async (tx) => ...)`
 * callback.
 *
 * Best-effort by design: a failed email or WA send is logged, never thrown
 * — the underlying business action (quotation approved, PO submitted, etc.)
 * has already been saved successfully by the time this runs, so a
 * notification hiccup must never look like the action itself failed.
 */
export interface OutboundTarget {
  role?: UserRole;
  userId?: string;
  userIds?: string[];
  /** Every active user. For company-wide announcements only. */
  allActive?: boolean;
}

export interface OutboundPayload {
  title: string;
  message: string;
  link?: string;
}

function buildEmailHtml(payload: OutboundPayload, recipientName: string) {
  const appUrl = process.env.APP_BASE_URL || "";
  const linkHtml = payload.link
    ? `<p style="margin-top:16px"><a href="${appUrl}${payload.link}" style="background:#1F3864;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Buka di SSO Connect</a></p>`
    : "";
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto">
      <p>Halo ${recipientName},</p>
      <p style="font-weight:600;font-size:15px">${payload.title}</p>
      <p style="color:#333">${payload.message}</p>
      ${linkHtml}
      <p style="margin-top:24px;color:#888;font-size:12px">SSO Connect — PT Sarana Sinergi Optima. Notifikasi otomatis, mohon tidak membalas email ini.</p>
    </div>
  `;
}

function buildWaMessage(payload: OutboundPayload, recipientName: string) {
  const appUrl = process.env.APP_BASE_URL || "";
  const linkLine = payload.link ? `\n\n${appUrl}${payload.link}` : "";
  return `Halo ${recipientName},\n\n*${payload.title}*\n${payload.message}${linkLine}\n\n— SSO Connect`;
}

async function dispatchToUser(
  user: { name: string; email: string | null; whatsappNumber: string | null },
  payload: OutboundPayload
): Promise<{ attempted: boolean; delivered: boolean }> {
  const jobs: Promise<boolean>[] = [];
  if (user.email) {
    jobs.push(sendEmail({ to: user.email, subject: payload.title, html: buildEmailHtml(payload, user.name) }));
  }
  if (user.whatsappNumber) {
    jobs.push(sendWhatsApp({ to: user.whatsappNumber, message: buildWaMessage(payload, user.name) }));
  }
  if (jobs.length === 0) return { attempted: false, delivered: false };
  const results = await Promise.allSettled(jobs);
  const delivered = results.some((r) => r.status === "fulfilled" && r.value === true);
  return { attempted: true, delivered };
}

/**
 * Both sendEmail/sendWhatsApp return `false` for two very different
 * situations: "not configured yet" (expected, safe default before
 * SMTP_APP_PASSWORD/FONNTE_TOKEN exist) and "configured but the actual send
 * failed" (a real problem — expired credential, provider outage, rate
 * limit). Only the latter is worth alerting on; this mirrors the same
 * NOTIFICATIONS_OUTBOUND_ENABLED + credential-presence check email.ts's own
 * isConfigured() uses, so "attempted" here means the same thing it does
 * there.
 */
function isOutboundConfigured(): boolean {
  if (process.env.NOTIFICATIONS_OUTBOUND_ENABLED !== "true") return false;
  return Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD) || Boolean(process.env.FONNTE_TOKEN);
}

const DELIVERY_FAILURE_ALERT_DEDUPE_HOURS = 6;

/**
 * Surfaces a total outbound delivery failure as an in-app ADMIN
 * notification — the only visibility this app has into "the WA/email
 * credentials configured months ago quietly stopped working" without a
 * dedicated error-monitoring service. Deduped to at most once per ~6h so a
 * prolonged provider outage doesn't flood the notification bell.
 */
async function alertOutboundDeliveryFailure(originalTitle: string) {
  try {
    const recent = await prisma.notification.findFirst({
      where: { type: "OUTBOUND_DELIVERY_FAILED", createdAt: { gt: new Date(Date.now() - DELIVERY_FAILURE_ALERT_DEDUPE_HOURS * 60 * 60 * 1000) } },
    });
    if (recent) return;

    const title = "Pengiriman notifikasi WA/email gagal";
    const message = `Notifikasi "${originalTitle}" gagal terkirim ke SEMUA penerima meski SMTP/Fonnte sudah dikonfigurasi. Cek kredensial (App Password Gmail / token Fonnte) atau kemungkinan provider sedang bermasalah.`;
    await prisma.$transaction((tx) => notifyRole(tx, "ADMIN", { type: "OUTBOUND_DELIVERY_FAILED", title, message }));
  } catch (err) {
    console.error("[notifications/dispatch] alertOutboundDeliveryFailure failed:", err);
  }
}

/**
 * Fire-and-forget outbound dispatch. Always resolves, never rejects — wrap
 * with `.catch()` at the call site anyway as defense in depth (see
 * markQuotationWon for the established pattern).
 */
export async function dispatchOutbound(target: OutboundTarget, payload: OutboundPayload): Promise<void> {
  try {
    const where = target.allActive
      ? { isActive: true }
      : target.userIds?.length
      ? { id: { in: target.userIds }, isActive: true }
      : target.userId
      ? { id: target.userId, isActive: true }
      : target.role
      ? { role: target.role, isActive: true }
      : null;
    const users = where
      ? await prisma.user.findMany({ where, select: { name: true, email: true, whatsappNumber: true } })
      : [];
    const outcomes = await Promise.allSettled(users.map((u) => dispatchToUser(u, payload)));

    if (isOutboundConfigured()) {
      const attempted = outcomes.filter((o): o is PromiseFulfilledResult<{ attempted: boolean; delivered: boolean }> => o.status === "fulfilled" && o.value.attempted);
      const allFailed = attempted.length > 0 && attempted.every((o) => !o.value.delivered);
      if (allFailed) {
        await alertOutboundDeliveryFailure(payload.title);
      }
    }
  } catch (err) {
    console.error("[notifications/dispatch] dispatchOutbound failed:", err);
  }
}
