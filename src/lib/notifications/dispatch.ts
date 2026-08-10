import "server-only";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
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
) {
  const jobs: Promise<boolean>[] = [];
  if (user.email) {
    jobs.push(sendEmail({ to: user.email, subject: payload.title, html: buildEmailHtml(payload, user.name) }));
  }
  if (user.whatsappNumber) {
    jobs.push(sendWhatsApp({ to: user.whatsappNumber, message: buildWaMessage(payload, user.name) }));
  }
  if (jobs.length === 0) return;
  await Promise.allSettled(jobs);
}

/**
 * Fire-and-forget outbound dispatch. Always resolves, never rejects — wrap
 * with `.catch()` at the call site anyway as defense in depth (see
 * markQuotationWon for the established pattern).
 */
export async function dispatchOutbound(target: OutboundTarget, payload: OutboundPayload): Promise<void> {
  try {
    const users = target.userId
      ? await prisma.user.findMany({
          where: { id: target.userId, isActive: true },
          select: { name: true, email: true, whatsappNumber: true },
        })
      : target.role
      ? await prisma.user.findMany({
          where: { role: target.role, isActive: true },
          select: { name: true, email: true, whatsappNumber: true },
        })
      : [];
    await Promise.allSettled(users.map((u) => dispatchToUser(u, payload)));
  } catch (err) {
    console.error("[notifications/dispatch] dispatchOutbound failed:", err);
  }
}
