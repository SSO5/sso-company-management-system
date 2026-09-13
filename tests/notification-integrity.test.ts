import test from "node:test";
import assert from "node:assert/strict";
import { notificationConfig, notificationLink, escapeHtml, smtpConnectionOptions, summarizeChannel } from "../src/lib/notifications/config";
import { testWhatsAppConnectionCloud } from "../src/lib/notifications/whatsapp-cloud";
import { testWhatsAppConnectionFonnte } from "../src/lib/notifications/whatsapp-fonnte";
import { summarizeIssuedInvoices } from "../src/lib/invoice-summary";

test("partial Cloud configuration never silently selects the legacy gateway", () => {
  const result = notificationConfig({ WHATSAPP_CLOUD_API_TOKEN: "example", FONNTE_TOKEN: "example", APP_BASE_URL: "https://example.com" });
  assert.equal(result.provider, "cloud");
  assert.equal(result.whatsappReady, false);
  assert.equal(result.enabled, false);
});
test("SMTP 587 requires STARTTLS, 465 uses implicit TLS, and requests have a timeout", () => {
  assert.equal(smtpConnectionOptions({ SMTP_PORT: "587" }).secure, false);
  assert.equal(smtpConnectionOptions({ SMTP_PORT: "587" }).requireTLS, true);
  assert.equal(smtpConnectionOptions({}).secure, true);
  assert.equal(smtpConnectionOptions({}).connectionTimeout, 10000);
  assert.throws(() => smtpConnectionOptions({ SMTP_PORT: "bad" }));
});
test("notification links remain HTTPS and same-origin; email text cannot inject markup", () => {
  assert.equal(notificationLink("/projects/a", "https://example.com/"), "https://example.com/projects/a");
  for (const path of ["//evil.example/a", "https://evil.example", "javascript:alert(1)"]) assert.equal(notificationLink(path, "https://example.com"), null);
  assert.equal(notificationLink("/a", "http://example.com"), null);
  assert.equal(escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
});
test("a working email channel does not conceal failed WhatsApp attempts", () => {
  const results = [{ channel: "email" as const, accepted: true }, { channel: "whatsapp" as const, accepted: false }];
  assert.deepEqual(summarizeChannel(results, "whatsapp"), { attempted: 1, accepted: 0, failed: 1 });
  assert.deepEqual(summarizeChannel([], "email"), { attempted: 0, accepted: 0, failed: 0 });
});
test("an overpaid invoice cannot offset another invoice's outstanding amount; drafts excluded", () => {
  const summary = summarizeIssuedInvoices([
    { status: "PAID", grandTotal: 100, paidAmount: 150, withholdingTax: 0 },
    { status: "ISSUED", grandTotal: 100, paidAmount: 0, withholdingTax: 0 },
    { status: "DRAFT", grandTotal: 1000, paidAmount: 0, withholdingTax: 0 },
  ]);
  assert.equal(summary.count, 2);
  assert.equal(summary.totalInvoiced, 200);
  assert.equal(summary.outstanding, 100);
});
test("provider success requires explicit acknowledgment and never claims handset delivery", async (t) => {
  const keys = ["APP_BASE_URL", "WHATSAPP_CLOUD_API_TOKEN", "WHATSAPP_CLOUD_API_PHONE_NUMBER_ID", "FONNTE_TOKEN"];
  const before = keys.map(k=>process.env[k]);
  process.env.APP_BASE_URL = "https://example.com";
  for (const key of keys.slice(1)) process.env[key] = "test-only";
  const input = { to: "628000000000", recipientName: "Penguji", title: "Uji", message: "baris\r\nkedua", link: "/dashboard" };
  let response: unknown = {};
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => { requests.push(init); return new Response(JSON.stringify(response), { status: 200 }); });
  try {
    assert.equal((await testWhatsAppConnectionCloud(input)).ok, false);
    response = { messages: [{ id: "wamid.test" }] };
    const cloud = await testWhatsAppConnectionCloud(input);
    assert.equal(cloud.ok, true);
    assert.match(cloud.reason, /belum terkonfirmasi/);
    assert.ok(requests[0].signal);
    assert.equal(JSON.parse(String(requests[1].body)).template.components[0].parameters[2].text, "baris kedua");
    response = {};
    assert.equal((await testWhatsAppConnectionFonnte(input)).ok, false);
    response = { status: true };
    assert.equal((await testWhatsAppConnectionFonnte(input)).ok, true);
  } finally {
    keys.forEach((key, i) => { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i]; });
  }
});
