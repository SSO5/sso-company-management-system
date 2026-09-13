type Env = Record<string, string | undefined>;

/** Pure configuration checks. Never return credentials or recipient addresses. */
export function notificationConfig(env: Env = process.env) {
  const present = (key: string) => Boolean(env[key]?.trim());
  const cloudStarted = present("WHATSAPP_CLOUD_API_TOKEN") || present("WHATSAPP_CLOUD_API_PHONE_NUMBER_ID");
  const cloudReady = present("WHATSAPP_CLOUD_API_TOKEN") && present("WHATSAPP_CLOUD_API_PHONE_NUMBER_ID");
  const provider = cloudStarted ? "cloud" : present("FONNTE_TOKEN") ? "fonnte" : "none";
  const port = Number(env.SMTP_PORT || 465);
  let appUrlReady = false;
  appUrlReady = notificationLink(undefined, env.APP_BASE_URL || "") !== null;
  return {
    enabled: env.NOTIFICATIONS_OUTBOUND_ENABLED === "true",
    provider,
    whatsappReady: provider === "cloud" ? cloudReady && appUrlReady : provider === "fonnte" && appUrlReady,
    cloudReady,
    cloudStarted,
    appUrlReady,
    emailReady: present("SMTP_USER") && present("SMTP_APP_PASSWORD") && Number.isInteger(port) && port > 0 && port <= 65535,
    smtpPort: port,
    templateName: env.WHATSAPP_CLOUD_API_TEMPLATE_NAME || "sso_notifikasi",
    templateLanguage: env.WHATSAPP_CLOUD_API_TEMPLATE_LANG || "id",
  };
}

export function smtpConnectionOptions(env: Env = process.env) {
  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port SMTP tidak valid.");
  return { host: env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465, requireTLS: port !== 465,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 };
}

export function notificationLink(path: string | undefined, base = process.env.APP_BASE_URL || "") {
  try {
    const origin = new URL(base);
    if (origin.protocol !== "https:" || origin.username || origin.password) return null;
    const url = new URL(path || "/", origin.origin);
    if (url.origin !== origin.origin) return null;
    return url.href;
  } catch { return null; }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function summarizeChannel(results: { channel: "email" | "whatsapp"; accepted: boolean }[], channel: "email" | "whatsapp") {
  const selected = results.filter((r) => r.channel === channel);
  return { attempted: selected.length, accepted: selected.filter((r) => r.accepted).length, failed: selected.filter((r) => !r.accepted).length };
}
