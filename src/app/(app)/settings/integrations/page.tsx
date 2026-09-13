import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { notificationConfig } from "@/lib/notifications/config";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export default async function IntegrationsPage() {
  const actor = await requireUser();
  requirePermission(actor.role, "settings", "view");
  const config = notificationConfig();
  const [activeUsers, usersWithWhatsApp, recent] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true, whatsappNumber: { not: null } } }),
    prisma.notification.findMany({ where: { userId: actor.userId, type: { in: ["OUTBOUND_DELIVERY_FAILED", "OUTBOUND_EMAIL_FAILED", "OUTBOUND_WHATSAPP_FAILED"] } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const checks = [
    ["Pengiriman eksternal", config.enabled ? "Diaktifkan" : "Dimatikan", "Status ini hanya sakelar pengiriman; bukan bukti pesan sudah sampai."],
    ["WhatsApp", config.provider === "cloud" ? "Meta Cloud API" : config.provider === "fonnte" ? "Fonnte (penyedia lama)" : "Belum dikonfigurasi", config.whatsappReady ? "Konfigurasi dasar tersedia. Token, persetujuan template, dan penerimaan pesan belum diverifikasi." : "Konfigurasi belum lengkap. Periksa token, ID nomor Cloud API, dan alamat aplikasi. Cloud API yang terisi sebagian tidak dialihkan otomatis ke penyedia lain."],
    ["Email", config.emailReady ? "Konfigurasi dasar tersedia" : "Konfigurasi belum lengkap", "Kredensial belum diuji. Koneksi memakai TLS; port 465 menggunakan TLS langsung, port lain mewajibkan STARTTLS."],
    ["Tautan aplikasi", config.appUrlReady ? "Alamat HTTPS tersedia" : "Perlu dilengkapi", "Tautan notifikasi dibatasi ke alamat aplikasi yang dikonfigurasi."],
  ];
  return <div className="space-y-6">
    <div className="workspace-heading"><div><p className="workspace-eyebrow">Kesehatan layanan</p><h1>Integrasi & Notifikasi</h1><p className="workspace-muted mt-2">Pemeriksaan konfigurasi tanpa mengirim pesan atau membuka kredensial.</p></div></div>
    <div className="grid gap-4 md:grid-cols-2">{checks.map(([title, status, note]) => <section key={title} className="rounded-2xl border p-5"><h2 className="font-semibold">{title}</h2><p className="my-3 text-lg">{status}</p><p className="text-sm leading-relaxed text-muted-foreground">{note}</p></section>)}</div>
    <section className="rounded-2xl border p-5 space-y-3"><h2 className="font-semibold">Langkah pemeriksaan</h2><p className="text-sm">{usersWithWhatsApp} dari {activeUsers} akun aktif memiliki nomor WhatsApp. Keberadaan nomor tidak membuktikan persetujuan penerima maupun bahwa nomor masih aktif.</p><ol className="list-decimal pl-5 space-y-2 text-sm"><li>Pastikan penyedia dan alamat aplikasi benar pada pengaturan hosting.</li><li>Untuk Cloud API, pastikan template disetujui dan nama serta bahasanya sesuai konfigurasi.</li><li>Uji hanya ke nomor milik pengguna yang menyetujui pengujian. Tombol pada Profil Saya mengirim satu pesan nyata.</li><li>Periksa pesan di ponsel penerima. Aplikasi saat ini belum menyimpan konfirmasi delivered/read dari webhook.</li></ol><Link href="/settings/profile" className="inline-block py-3 font-medium text-primary">Buka Profil Saya →</Link></section>
    <section className="rounded-2xl border p-5 space-y-3"><h2 className="font-semibold">Riwayat kegagalan yang dapat Anda lihat</h2><p className="text-xs text-muted-foreground">Maksimal 10 pemberitahuan milik akun Anda. Riwayat kosong bukan bukti integrasi sehat; kegagalan lama tetap disimpan apa adanya.</p>{recent.length ? recent.map(n=><article key={n.id} className="border-t pt-3"><p className="text-xs text-muted-foreground">{formatDate(n.createdAt)}</p><h3 className="text-sm font-semibold mt-1">{n.title}</h3><p className="text-sm mt-1 break-words">{n.message}</p></article>) : <p className="text-sm">Belum ada catatan kegagalan untuk akun ini.</p>}</section>
  </div>;
}
