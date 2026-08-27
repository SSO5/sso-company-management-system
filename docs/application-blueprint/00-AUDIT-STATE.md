# Audit State — SSO Connect Application Blueprint

Memory file untuk sesi audit ini. Update terus selama proses berjalan.

# Tahap Saat Ini
Audit selesai — Blueprint 10 halaman sudah ditulis di `10-PAGE-APPLICATION-BLUEPRINT.md`.

# Yang Sudah Selesai
- Reconnaissance struktur project (package.json, folder src/, prisma/, .github/workflows/).
- Baca penuh: `README.md`, `src/lib/permissions.ts`, `src/middleware.ts`, `src/lib/auth/current-user.ts`,
  `src/lib/auth/session.ts`, `src/lib/notifications/*` (dispatch/whatsapp/email/telegram),
  `src/app/api/cron/daily/route.ts`, `src/app/api/cron/directives/route.ts`, `src/lib/ai/client.ts`.
- Grep-scan: seluruh enum di `prisma/schema.prisma` (23 enum), seluruh model (37 model),
  seluruh route halaman (`page.tsx`, 45 halaman) dan API (`route.ts`, 8 route),
  seluruh fungsi export di `lib/workflows/quotation.ts`, `project.ts`, `finance.ts`,
  seluruh nama tool di `lib/ai/assistant-tools.ts` (60+ tools),
  seluruh file `.github/workflows/*.yml` (26 workflow).
- Baca penuh `model User` di schema (login lockout, uiMood, telegramChatId, whatsappNumber, relasi).
- Konteks tambahan dari histori sesi ini sendiri (bukan re-read file): sistem "suasana"/mood,
  login lockout, WhatsApp Cloud API + Fonnte dual-provider, pola workflow GitHub Actions untuk
  schema/repair/diagnose.

# File yang Sudah Diperiksa
- README.md (full)
- package.json (full)
- prisma/schema.prisma (grep enum+model penuh, model User full, ~1714 baris — TIDAK dibaca body detail tiap model)
- src/lib/permissions.ts (full)
- src/middleware.ts (full)
- src/lib/auth/current-user.ts (full), session.ts (head)
- src/lib/notifications/dispatch.ts, whatsapp.ts, whatsapp-cloud.ts, whatsapp-fonnte.ts (full, dari sesi sebelumnya)
- src/lib/workflows/quotation.ts, project.ts, finance.ts (export signatures + grep status flow)
- src/lib/ai/assistant-tools.ts (grep nama tool saja, bukan body)
- src/lib/ai/client.ts (head)
- src/lib/workflows/cron-jobs.ts (head, sebagian)
- src/app/api/cron/daily/route.ts, cron/directives/route.ts (full)
- src/lib/storage.ts (head/komentar arsitektur)
- .env.example (grep key)
- .github/workflows/*.yml (list nama + isi backup-daily.yml + cron-daily.yml + cron-directives.yml)
- src/lib/nav.ts, src/components/layout/sidebar.tsx, src/components/dashboard/profile-hub.tsx
  (dari histori sesi sebelumnya, bukan dibaca ulang di audit ini)

# Temuan Penting
1. Aplikasi PRODUCTION REAL (bukan mockup) — Next.js 14 App Router + Prisma 5 + PostgreSQL (Neon),
   dipakai harian oleh PT Sarana Sinergi Optima. README menyatakan awalnya "belum pernah di-build",
   tapi bukti sesi ini (banyak PR merged, workflow migrasi jalan, user real bernama Dwiki/Faldy
   login) menunjukkan app SUDAH LIVE dan dipakai — README bagian "Honest status" SUDAH USANG,
   jangan dipercaya sebagai kondisi terkini.
2. RBAC matrix sangat eksplisit dan konsisten: 6 role (ADMIN, SALES, FINANCE, PROJECT_MANAGER,
   VIEWER, IT), matrix modul x action di satu file (`lib/permissions.ts`), plus guard khusus
   maker-checker untuk approval (approver harus ADMIN dan bukan submitter yang sama).
3. Core business flow (spec inti aplikasi): Customer → Opportunity → Costing → Quotation →
   (WON) → Project (otomatis, satu transaksi) → Invoice → Payment. Ini adalah alur yang PALING
   penting untuk Halaman 4 Blueprint.
4. Automation surface JAUH lebih besar dari yang README sebut: AI assistant "AISSO" (60+ tool,
   Claude Sonnet), AI document extraction (Claude Haiku), Telegram bot (paralel penuh untuk
   costing/quotation/invoice/progress report), Directive broadcast (drip-feed anti-ban WA),
   WhatsApp dual-provider (Cloud API + Fonnte fallback, dibangun sesi ini), sistem mood personal.
   README HANYA menyebut "notifications not wired" — ini SALAH/USANG, sudah wired penuh sesi ini.
5. Scheduling BUKAN via Vercel Cron — pakai GitHub Actions (`cron-daily.yml` jam 00:00 UTC,
   `cron-directives.yml` tiap 5 menit, `backup-daily.yml` jam 18:00 UTC) yang hit endpoint
   `/api/cron/*` dengan Bearer `CRON_SECRET`.
6. Migrasi schema TIDAK pakai `prisma migrate deploy` standar di CI — pakai workflow one-off
   manual (`db-schema-*.yml`) per perubahan, dieksekusi manual via `workflow_dispatch`. ini pola
   operasional NYATA yang dipakai sepanjang sesi ini (bukan asumsi) — lihat 15+ file
   `db-schema-*`/`db-repair-*`/`db-diagnose-*` di `.github/workflows/`.
7. Storage: driver "local" TIDAK berfungsi di Vercel (filesystem ephemeral) — production HARUS
   pakai S3-compatible (disebut eksplisit di komentar `storage.ts`). Status konfigurasi aktual
   (apakah S3 sudah diisi di Vercel) BELUM TERVERIFIKASI dari kode saja.
8. Login lockout (brute-force protection) ditambahkan "Aug 2026" per komentar schema — fitur baru,
   bukan bagian asli aplikasi.

# Hal yang Belum Terverifikasi
- Apakah STORAGE_DRIVER di production Vercel benar-benar "s3" (bukan "local") — tidak bisa
  dipastikan dari source code, hanya dari env var runtime yang tidak terlihat dari sini.
- Apakah semua 26 GitHub Actions workflow di atas SEMUANYA sudah pernah dijalankan sukses
  (beberapa mungkin dibuat lalu tidak pernah dipakai) — tidak dicek run history satu-satu.
- Detail lengkap tiap 37 model Prisma (relasi field-by-field) — hanya model User yang dibaca penuh;
  model lain hanya diketahui dari nama + enum status terkait.
- Isi lengkap 60+ tool AISSO (hanya nama tool yang di-grep, bukan body/permission check tiap tool).
- Apakah CSV/PDF export report (disebut README belum ada) masih benar-benar belum ada, atau sudah
  ditambahkan setelah README ditulis — belum dicek `src/server/reports/reports.ts` isi lengkapnya.
- Apakah fitur "AI Smart Upload" (disebut di histori sesi/plan file sebelumnya) benar-benar sudah
  live dan dipakai, atau baru direncanakan.

# File yang Perlu Diperiksa Berikutnya (jika audit dilanjutkan/diperdalam)
- `src/server/reports/reports.ts` — untuk verifikasi klaim README soal CSV/PDF export.
- `prisma/schema.prisma` bagian Quotation/Project/Invoice/Document/CompanySettings full body —
  untuk ERD yang lebih presisi field-by-field bila diperlukan detail lebih dalam dari Blueprint.
- `src/lib/workflows/folders.ts` — detail auto-generate folder per project/opportunity.
- Konfigurasi Vercel project (env var aktual) — tidak bisa diakses dari repo, perlu tanya pemilik.

# File yang Tidak Perlu Dibaca Ulang
Semua file yang disebut di "File yang Sudah Diperiksa" di atas — informasinya sudah dicatat di
`01-EVIDENCE-NOTES.md`, jangan re-read kecuali untuk verifikasi spesifik yang diminta pemilik app.

# Progress Blueprint 10 Halaman
| # | Halaman | Status |
|---|---|---|
| 1 | Executive Overview | SELESAI |
| 2 | Application Map | SELESAI |
| 3 | Users, Roles & Access | SELESAI |
| 4 | End-to-End Business Flow | SELESAI |
| 5 | Navigation & Screen Map | SELESAI |
| 6 | Data Model / ERD | SELESAI |
| 7 | Business Rules & Status | SELESAI |
| 8 | System Architecture | SELESAI |
| 9 | Integration & Automation | SELESAI |
| 10 | Current State & Gap | SELESAI |
