// Called only from server workflows, after the business transaction commits.
import { prisma } from "@/lib/db";
import { sendEmail } from "./email";
import { sendWhatsApp } from "./whatsapp";
import { escapeHtml, notificationConfig, notificationLink, summarizeChannel } from "./config";
import { notifyRole } from "@/lib/workflows/notify";
import type { UserRole } from "@prisma/client";
export interface OutboundTarget { role?: UserRole; userId?: string; userIds?: string[]; allActive?: boolean }
export interface OutboundPayload { title: string; message: string; link?: string }
type Outcome = { channel: "email" | "whatsapp"; accepted: boolean };
function buildEmailHtml(payload: OutboundPayload, name: string) {
  const link = notificationLink(payload.link);
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto"><p>Halo ${escapeHtml(name)},</p><h3>${escapeHtml(payload.title)}</h3><p>${escapeHtml(payload.message).replace(/\r?\n/g, "<br>")}</p>${link ? `<p><a href="${escapeHtml(link)}">Buka di SSO Connect</a></p>` : ""}<p>SSO Connect — PT Sarana Sinergi Optima</p></div>`;
}
async function dispatchToUser(user: { name: string; email: string | null; whatsappNumber: string | null }, payload: OutboundPayload): Promise<Outcome[]> {
  const config = notificationConfig();
  const jobs: { channel: Outcome["channel"]; work: Promise<boolean> }[] = [];
  if (config.emailReady && user.email) jobs.push({ channel: "email", work: sendEmail({ to: user.email, subject: payload.title, html: buildEmailHtml(payload, user.name) }) });
  if (config.whatsappReady && user.whatsappNumber) jobs.push({ channel: "whatsapp", work: sendWhatsApp({ to: user.whatsappNumber, recipientName: user.name, ...payload }) });
  const results = await Promise.allSettled(jobs.map((job) => job.work));
  return results.map((result, i) => ({ channel: jobs[i].channel, accepted: result.status === "fulfilled" && result.value }));
}
async function alertChannelFailure(channel: Outcome["channel"], attempted: number, accepted: number, provider: string) {
  const type = channel === "email" ? "OUTBOUND_EMAIL_FAILED" : "OUTBOUND_WHATSAPP_FAILED";
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const recent = await prisma.notification.findFirst({ where: { type, createdAt: { gt: since } }, select: { id: true } });
  if (recent) return;
  const label = channel === "email" ? "Email" : `WhatsApp (${provider === "cloud" ? "Cloud API" : "Fonnte"})`;
  await prisma.$transaction((tx) => notifyRole(tx, "ADMIN", {
    type, title: `${label}: ada permintaan yang gagal`,
    message: `${accepted} dari ${attempted} permintaan diterima penyedia. Periksa konfigurasi dan status penyedia. Diterima penyedia belum membuktikan pesan sampai ke penerima. Tidak ada pengiriman ulang otomatis.`,
    link: "/settings/integrations",
  }));
}
/** Best effort; never turn a saved business action into a failed UI response. No automatic retries. */
export async function dispatchOutbound(target: OutboundTarget, payload: OutboundPayload): Promise<void> {
  try {
    const config = notificationConfig();
    if (!config.enabled || (!config.emailReady && !config.whatsappReady)) return;
    const where = target.allActive ? { isActive: true }
      : target.userIds?.length ? { id: { in: target.userIds }, isActive: true }
      : target.userId ? { id: target.userId, isActive: true }
      : target.role ? { role: target.role, isActive: true } : null;
    if (!where) return;
    const users = await prisma.user.findMany({ where, select: { name: true, email: true, whatsappNumber: true } });
    const outcomes: Outcome[] = [];
    for (let offset = 0; offset < users.length; offset += 5) {
      const batch = await Promise.allSettled(users.slice(offset, offset + 5).map((user) => dispatchToUser(user, payload)));
      for (const result of batch) if (result.status === "fulfilled") outcomes.push(...result.value);
    }
    for (const channel of ["email", "whatsapp"] as const) {
      const summary = summarizeChannel(outcomes, channel);
      if (summary.failed) await alertChannelFailure(channel, summary.attempted, summary.accepted, config.provider);
    }
  } catch {
    console.error("[notifications/dispatch] outbound request or diagnostic could not complete");
  }
}
