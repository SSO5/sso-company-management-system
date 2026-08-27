# Evidence Notes — SSO Connect

Fakta ringkas dari source code. Dipakai sebagai sumber utama penyusunan Blueprint.

---
## EVIDENCE-001
Kategori: Tech Stack
Temuan: Next.js 14 (App Router), React 18, TypeScript, Prisma 5 + PostgreSQL, Tailwind CSS.
Sumber: package.json
Confidence: HIGH

---
## EVIDENCE-002
Kategori: Authentication
Temuan: Password bcrypt hash (12 rounds), session = signed JWT (jose, HS256) di httpOnly cookie.
Diverifikasi 2x: edge middleware (`src/middleware.ts`) untuk semua request, dan
`requireUser()`/`requireUserOrThrow()` di tiap Server Action/page. Ada brute-force lockout:
`User.failedLoginAttempts` + `User.lockedUntil` (ditambahkan Agustus 2026).
Sumber: src/middleware.ts, src/lib/auth/session.ts, src/lib/auth/current-user.ts, prisma/schema.prisma (model User)
Key Symbol: createSession(), requireUserOrThrow(), MAX_FAILED_LOGIN_ATTEMPTS
Confidence: HIGH

---
## EVIDENCE-003
Kategori: Authorization
Temuan: Satu file matrix (`lib/permissions.ts`) mendefinisikan 6 role x 8 modul x 7 action.
Role: ADMIN, SALES, FINANCE, PROJECT_MANAGER, VIEWER, IT. Modul: sales, finance, project,
documents, reports, users, settings, activityLog. Action: view/create/update/delete/approve/close/manage.
Approval (Quotation/Invoice/Vendor PO/Expense) selalu ADMIN-only DAN approver ≠ submitter
(maker-checker), lewat fungsi requireApprover() terpisah dari matrix biasa.
Sumber: src/lib/permissions.ts
Confidence: HIGH

---
## EVIDENCE-004
Kategori: Core Business Flow
Temuan: Customer/Contact → Lead → Opportunity (NEW→QUALIFIED→PROPOSAL→NEGOTIATION→WON/LOST)
→ CostingSheet → Quotation (DRAFT→SUBMITTED→UNDER_REVIEW→APPROVED/REJECTED→SENT→WON/LOST/
EXPIRED/CANCELLED). Saat Quotation di-mark WON, `markQuotationWon()` memanggil
`convertQuotationToProject()` DALAM transaksi database yang sama — otomatis membuat Project,
folder tree, default task, default milestone, notifikasi — atomik, tidak ada Project setengah jadi.
Sumber: src/lib/workflows/quotation.ts (markQuotationWon, line ~368), src/lib/workflows/project.ts (convertQuotationToProject)
Confidence: HIGH

---
## EVIDENCE-005
Kategori: Core Business Flow
Temuan: Project berjalan (status PLANNING→ACTIVE→ON_HOLD→AT_RISK→COMPLETED/CANCELLED→CLOSED)
menghasilkan ProjectTask, ProjectMilestone, ProjectExpense, ProgressReport. Invoice dibuat dari
Project (DRAFT→SUBMITTED→APPROVED/REJECTED→ISSUED→PARTIALLY_PAID→PAID/OVERDUE→CANCELLED),
Payment dicatat terhadap Invoice, otomatis update status+outstanding.
Sumber: prisma/schema.prisma (enum ProjectStatus, InvoiceStatus), src/lib/workflows/finance.ts (createInvoice, recordPayment)
Confidence: HIGH

---
## EVIDENCE-006
Kategori: Procurement (jalur paralel)
Temuan: VendorPurchaseOrder (SSO → Vendor, beda dari PurchaseOrder pelanggan→SSO) punya alur
approval sendiri (DRAFT→SUBMITTED→APPROVED/REJECTED→SENT→CONFIRMED→CANCELLED), approval
tetap ADMIN-only + maker-checker sama seperti Quotation/Invoice/Expense.
Sumber: prisma/schema.prisma (enum VendorPurchaseOrderStatus), lib/permissions.ts (requireVendorPOApprover)
Confidence: HIGH

---
## EVIDENCE-007
Kategori: Data Correction / Exception Rule
Temuan: Dokumen yang sudah lewat status DRAFT terkunci (tidak bisa diedit oleh alur normal manapun).
Satu-satunya jalan mengubahnya (nomor dokumen, nama file, folder/project tujuan) adalah
`requireDataCorrector()` — hanya ADMIN dan IT, dan setiap penggunaannya di-log via activity log
(bukan diam-diam). Ini exception yang EKSPLISIT dan tunggal, bukan celah keamanan.
Sumber: src/lib/permissions.ts (requireDataCorrector), src/lib/workflows/corrections.ts
Confidence: HIGH

---
## EVIDENCE-008
Kategori: Nomor Dokumen
Temuan: Penomoran otomatis atomik (mencegah nomor kembar meski request bersamaan) untuk 15 jenis
entitas (Customer, Lead, Opportunity, Quotation, PO, Contract, Project, Invoice, Payment, Expense,
Costing, Job Order, General Document, Vendor PO, Progress Report). Counter per tahun, format
seperti QT-2026-0001. Prefix/digit bisa diatur di Settings, counter sendiri tidak bisa diedit langsung.
Sumber: prisma/schema.prisma (enum NumberEntityType, model NumberSequence), README.md
Confidence: HIGH

---
## EVIDENCE-009
Kategori: Dokumen & Storage
Temuan: File TIDAK PERNAH public. Semua baca lewat `/api/files/[id]` atau
`/api/branding/[...key]`, yang cek ulang session + status trash tiap request. Driver storage:
"local" (disk, TIDAK JALAN di Vercel — filesystem ephemeral) atau "s3" (WAJIB untuk produksi
Vercel — Cloudflare R2/AWS S3/dst). Status driver aktual di produksi BELUM TERVERIFIKASI dari kode.
Sumber: src/lib/storage.ts
Confidence: HIGH (arsitektur) / BELUM TERVERIFIKASI (konfigurasi aktual di produksi)

---
## EVIDENCE-010
Kategori: AI — Assistant "AISSO"
Temuan: Chat assistant dalam aplikasi (komponen `AssistantWidget`, floating chat widget di semua
halaman) didukung 60+ tool function yang menjangkau HAMPIR SELURUH modul: query status
(quotation/invoice/vendor PO/expense/project), list records, approve/reject, create (costing,
invoice, vendor PO, progress report, customer, contact, opportunity, contract, task, milestone,
expense), update status. Prinsip eksplisit di kode: "AI drafts, people decide" — AI tidak pernah
langsung eksekusi tanpa lewat permission check yang sama seperti UI biasa.
Sumber: src/lib/ai/assistant-tools.ts (grep nama tool, 60+ entries), src/components/assistant/assistant-widget.tsx
Confidence: HIGH (keberadaan & cakupan) / MEDIUM (detail permission tiap tool belum dibaca satu-satu)

---
## EVIDENCE-011
Kategori: AI — Document Extraction
Temuan: Fitur terpisah dari AISSO: baca dokumen ter-upload (Purchase Order, Progress Report),
usulkan field terstruktur, manusia WAJIB konfirmasi sebelum tersimpan (tidak pernah auto-save).
Model: Claude Haiku (murah/cepat) untuk ekstraksi, Claude Sonnet untuk assistant chat.
Sumber: src/lib/ai/client.ts, src/lib/ai/extract-purchase-order.ts, extract-progress-report.ts
Key Symbol: getAnthropicClient(), extractionModel(), ANTHROPIC_ASSISTANT_MODEL
Confidence: HIGH

---
## EVIDENCE-012
Kategori: Integrasi — Telegram
Temuan: Bot Telegram sebagai kanal otomasi PARALEL penuh (bukan cuma notifikasi) — user bisa
buat/revisi costing, buat invoice, submit progress report (termasuk kirim foto), lewat chat
command yang di-parse AI. Identitas resolve via `telegramChatId` yang di-set manual oleh Admin
(bukan self-service, karena Telegram baru kasih chat ID setelah user DM bot duluan). Webhook di
`/api/telegram/webhook`, autentikasi via secret token header (bukan session cookie), termasuk
dalam PUBLIC_PATHS middleware.
Sumber: src/lib/workflows/telegram-automation.ts, src/middleware.ts, prisma/schema.prisma (User.telegramChatId)
Confidence: HIGH

---
## EVIDENCE-013
Kategori: Integrasi — Notifikasi Outbound
Temuan: Dispatch dual-channel (email + WhatsApp) per event bisnis (quotation approved, invoice
issued, dst) — `dispatchOutbound()`, best-effort (gagal kirim tidak pernah menggagalkan aksi
bisnis utamanya). Email via SMTP (Gmail App Password). WhatsApp: DUA provider — WhatsApp Business
Cloud API resmi Meta (diutamakan jika env var terisi) dengan fallback ke Fonnte (gateway tidak
resmi, dipertahankan untuk kompatibilitas mundur). Ditambahkan/direstrukturisasi dalam sesi ini
sendiri (bukan dari README, yang menyebut fitur ini "belum wired" — INFORMASI USANG).
Sumber: src/lib/notifications/dispatch.ts, whatsapp.ts, whatsapp-cloud.ts, whatsapp-fonnte.ts, email.ts
Confidence: HIGH

---
## EVIDENCE-014
Kategori: Personalisasi — "Suasana" (Mood)
Temuan: Picker tema personal per-user (murni kosmetik: background/glass/font), terpisah dari
"Tema" Admin-only (company-wide, cuma warna aksen). 3 pilihan: Operations Deck, Vision Glass,
Aurora Glass, plus Default. Disimpan di `User.uiMood`. Dibangun dalam sesi ini sendiri.
Sumber: prisma/schema.prisma (User.uiMood), src/lib/ui-moods.ts, src/components/layout/mood-switcher.tsx
Confidence: HIGH

---
## EVIDENCE-015
Kategori: Automasi Terjadwal
Temuan: TIDAK pakai Vercel Cron — pakai GitHub Actions schedule yang hit endpoint HTTP dengan
Bearer `CRON_SECRET`. Tiga jadwal: `cron-daily.yml` (00:00 UTC/07:00 WIB — invoice overdue,
billing schedule, project risk, SLA approval >48 jam, reminder invoice/milestone/kontrak/quotation
jatuh tempo, daily digest), `cron-directives.yml` (tiap 5 menit — drip-feed broadcast "Tugas dari
Direktur" beberapa penerima sekaligus, SENGAJA lambat untuk hindari nomor WA kena banned Meta),
`backup-daily.yml` (18:00 UTC/01:00 WIB — pg_dump disimpan sebagai GitHub Actions artifact 30 hari,
SATU-SATUNYA mekanisme backup).
Sumber: .github/workflows/cron-daily.yml, cron-directives.yml, backup-daily.yml, src/app/api/cron/daily/route.ts, cron/directives/route.ts
Confidence: HIGH

---
## EVIDENCE-016
Kategori: Proses Migrasi Schema (Operational Pattern)
Temuan: Perubahan schema database TIDAK memakai `prisma migrate deploy` otomatis di CI/CD — tiap
perubahan dibuatkan workflow GitHub Actions satu-kali (`db-schema-<nama>.yml`), dieksekusi manual
via `workflow_dispatch` terhadap `NEW_DATABASE_URL` secret, lalu (biasanya) dihapus/dibiarkan usang
setelah dipakai sekali. Ada 15+ file seperti ini di `.github/workflows/` (db-schema-*, db-repair-*,
db-diagnose-*). Ini pola operasional NYATA yang teramati langsung sepanjang sesi kerja ini
(bukan hanya dari membaca file).
Sumber: .github/workflows/db-schema-*.yml, db-repair-*.yml, db-diagnose-*.yml (15+ file)
Confidence: HIGH

---
## EVIDENCE-017
Kategori: Navigasi
Temuan: Sidebar 5-6 grup tergantung role (ADMIN lihat 6: Beranda, Pekerjaan, Keuangan, Laporan,
Pengaturan — role lain 4-5). Difilter di DUA level: grup DAN item di dalam grup (item Laporan
di-scope per-role, misal SALES cuma lihat "Penjualan" bukan 5 laporan). Grup dengan 1 item jadi
link langsung, grup >1 item jadi accordion.
Sumber: src/lib/nav.ts, src/components/layout/sidebar.tsx (dari histori sesi sebelumnya)
Confidence: HIGH

---
## EVIDENCE-018
Kategori: Reporting
Temuan: 5 laporan (Executive, Profitability, Sales, Finance, Project) pakai data agregasi nyata
dari `src/server/reports/reports.ts`, ditampilkan pakai chart (recharts). README menyatakan tombol
export CSV/PDF BELUM ada di halaman laporan (query agregasinya sudah ada, tinggal expose).
BELUM TERVERIFIKASI apakah ini masih akurat (README bisa usang seperti klaim notifikasi).
Sumber: README.md ("What's fully implemented"), src/server/reports/reports.ts (nama file saja, isi belum dibaca detail)
Confidence: MEDIUM

---
## EVIDENCE-019
Kategori: Audit Trail
Temuan: Setiap aksi penting dicatat di ActivityLog dengan action terstruktur (LOGIN, LOGOUT,
CREATE, UPDATE, DELETE, RESTORE, UPLOAD, DOWNLOAD, APPROVE, REJECT, STATUS_CHANGE, PAYMENT,
PROJECT_CREATED, PROJECT_COMPLETED, PROJECT_CLOSED) — bisa dilihat di halaman Activity Log
(ADMIN/IT only, view-only).
Sumber: prisma/schema.prisma (enum ActivityAction, model ActivityLog), lib/permissions.ts (activityLog: ["view"])
Confidence: HIGH

---
## EVIDENCE-020
Kategori: Directive ("Tugas dari Direktur")
Temuan: ADMIN bisa kirim tugas/reminder ke user lain lewat sistem (bukan WA pribadi) —
`requireDirectiveGiver()` khusus ADMIN, model `Directive` (status OPEN/DONE). Notifikasinya
sengaja di-drip lewat cron 5 menit, bukan langsung broadcast semua, karena burst-send WA adalah
penyebab utama nomor WA di-banned Meta (fakta ini juga relevan dengan kasus Fonnte suspend
yang ditangani di sesi ini).
Sumber: src/lib/permissions.ts (requireDirectiveGiver), prisma/schema.prisma (model Directive, enum DirectiveStatus), .github/workflows/cron-directives.yml
Confidence: HIGH
