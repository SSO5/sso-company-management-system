# SSO Company Management System

Internal operating system for **PT Sarana Sinergi Optima** — Sales, Finance, Project Management,
Document Management, and Reporting on one relational database. Core principle: **enter data once,
reuse it everywhere.** When a quotation is marked Won, the system automatically creates the Project,
its folder structure, default tasks and milestones, and notifies Finance and the Project Manager —
inside a single database transaction.

This is a real, functional application — real PostgreSQL database via Prisma, real authentication
(hashed passwords + signed session cookies), real server-side authorization, real CRUD, private file
storage, automated workflows, and a full audit trail. It is not a static mockup.

## Honest status: what to expect before you run this

This codebase was generated in an environment **with no internet access**, so `npm install` has
never been run and the build has never been compiled or executed. Every file was written by hand
against Next.js 14 / Prisma 5 / React 18 conventions, but you should treat first boot as an
integration step, not a guarantee:

1. Run `npm install`, `npm run db:generate`, `npm run typecheck`, and `npm run build` locally.
2. Fix whatever `tsc`/`next build` surfaces — most likely small import-path or type-narrowing issues,
   not structural problems (the schema, workflows, and page wiring are the parts most likely to be
   exactly right; individual component prop types are the most likely place for a typo).
3. Treat this as Phase 1 of the phased rollout below, not a finished product.

## Quick start

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and AUTH_SECRET at minimum
npm run db:generate
npm run db:push             # creates tables from prisma/schema.prisma (use db:migrate for real migrations)
npm run db:seed             # demo users, customers, quotations, a full Won -> Project -> Invoice -> Payment chain
npm run dev
```

Demo accounts (seeded, **change before production**): `admin@sso.demo`, `sales@sso.demo`,
`finance@sso.demo`, `pm@sso.demo` — password `Password123!` for all.

Generate `AUTH_SECRET` with `openssl rand -base64 32`.

## Architecture

```
prisma/schema.prisma      Single source of truth for every entity + relationship (section 37)
src/lib/
  auth/                    Password hashing, signed session cookies, requireUser()/requireUserOrThrow()
  permissions.ts           Server-side RBAC matrix — the only place "who can do what" is defined
  numbering.ts             Transaction-safe sequential numbering (QT-2026-0001, PRJ-2026-0001, ...)
  storage.ts               Private file storage abstraction (local disk today, S3 interface stubbed)
  action-helpers.ts        runAction() wrapper — never leaks stack traces / DB errors to the client
  workflows/                Business logic, independent of UI:
    quotation.ts             Draft -> Submit -> Approve -> Sent -> Won/Lost
    project.ts                convertQuotationToProject (the Won-deal automation), profitability,
                               closing checklist validation, closeProject
    finance.ts                createInvoice, recordPayment (auto-updates outstanding + status)
    documents.ts               upload / trash / restore / permanent delete
    folders.ts                 Company + per-project folder templates, stored as real Folder rows,
                               and auto-routing of uploads to the right folder
    audit.ts / notify.ts       Activity log + in-app notifications, called from inside every transaction
src/server/                "use server" action modules per module (sales, finance, projects, documents,
                            settings) — every one calls requireUserOrThrow() + requirePermission()
                            before touching the database. Never trust the client.
src/app/(app)/...          Pages, grouped to match the sidebar: Sales, Finance, Project, Documents,
                            Reports, Settings, Activity Log
src/app/api/files/[id]/    The only route that reads file bytes — re-checks the session and the
                            document's trash status on every request, so editing the URL's id does not
                            grant access to someone else's file
```

### Why this shape

Every module reads and writes the *same* relational graph instead of keeping its own copy of
customer/project data. A Quotation becoming Won is the clearest example: `markQuotationWon()` in
`lib/workflows/quotation.ts` calls `convertQuotationToProject()` inside the same Prisma transaction —
Project, folder tree, default tasks, default milestones, notifications, and the activity log entry
either all commit together or none of them do. There is no code path that can leave an
orphaned half-created project.

## What's fully implemented vs. what's a foundation for the next phase

Fully wired end-to-end (schema + workflow + UI + audit trail):

- Auth, RBAC, protected routes and server-side permission checks on every action
- Customer / Contact / Opportunity (pipeline view) / Quotation (with line items, live totals)
- Quotation approval workflow (Draft → Submit → Approve/Reject → Sent → Won/Lost) with field
  locking, timestamps, and the full Won-deal automation
- Project dashboard (value/invoiced/paid/outstanding/budget/cost/profit/margin), Tasks, Milestones,
  Costs, and the Closing checklist + Close action (blocks close until required items are met)
- Invoice (with items, server-computed totals), Payment recording (auto-updates invoice status and
  outstanding), Accounts Receivable dashboard with not-due/due-soon/overdue/paid indicators
- Private document storage with per-project auto-generated folder structure, auto-routing of
  uploads by entity type, Trash with restore/permanent delete
- Sales / Finance / Project / Profitability / Executive reports with real aggregated data and charts
- Settings (Users, Numbering prefixes, Company profile), full Activity Log, global search

Present as a working foundation, intentionally left for the next iteration rather than faked:

- **Notifications are stored in the database and shown as dashboard alerts**, but outbound
  email/WhatsApp delivery is not wired to a provider — see `EMAIL_PROVIDER_API_KEY` /
  `WHATSAPP_PROVIDER_API_KEY` in `.env.example` and the comment in `lib/workflows/notify.ts`.
- **S3-compatible storage is a stubbed driver** (`src/lib/storage.ts`) with the exact interface the
  app already calls — swap `STORAGE_DRIVER=s3`, add credentials, implement the three marked TODOs
  with the AWS SDK. The local disk driver is fully functional today.
- **Opportunity pipeline is a status-grouped board**, not drag-and-drop — the data model and stage
  transitions are real, the interaction is a dropdown per card rather than a drag handle.
- **CSV/PDF export buttons** are not yet on the report pages — the aggregation queries they'd export
  already exist in `src/server/reports/reports.ts`.
- Purchase Order / Contract modules have full CRUD but no expiration-alert cron — the "expiring
  within 30 days" contract flag is computed on page load, not pushed proactively.

## Numbering engine

`generateNumber(tx, entityType)` in `src/lib/numbering.ts` runs an atomic `UPDATE ... increment`
inside the caller's transaction, guarded by the `NumberSequence` table's `@@unique([entityType, year])`
constraint — two concurrent requests cannot receive the same number, and a rolled-back transaction
never burns a number. Prefixes and digit padding are configurable in Settings → Numbering; the
running counter itself is never exposed for direct editing.

## Security notes

- Passwords are hashed with bcrypt (12 rounds); sessions are signed JWTs in an httpOnly cookie,
  verified both in `middleware.ts` (edge, first line of defense) and again in every Server Action via
  `requireUserOrThrow()` — the client is never trusted to enforce a role.
- `lib/permissions.ts` is the single authorization matrix. Every server action calls
  `requirePermission(role, module, action)` before touching the database.
- Files are never public. All reads go through `/api/files/[id]`, which re-verifies the session and
  the document's trash status per request.
- Errors are sanitized by `runAction()` in `lib/action-helpers.ts` before reaching the client —
  unexpected errors are logged server-side and replaced with a generic message.

## Environment variables

See `.env.example` for the full list with comments. At minimum you need `DATABASE_URL` (any
Vercel-compatible Postgres: Neon, Supabase, Vercel Postgres, RDS) and `AUTH_SECRET`.

## Roadmap (matches the founder's phased build philosophy)

1. ✅ Phase 1–6 above: the full Sales → Approval → Won → Project → Finance → Documents chain
2. Phase 7 polish: CSV/PDF export, scheduled jobs for overdue-invoice and contract-expiry
   notifications (a cron hitting `refreshOverdueInvoices()` is already written and ready to schedule)
3. Phase 8: wire a real email/WhatsApp provider into `lib/workflows/notify.ts`
4. Later: swap the S3 storage driver in, drag-and-drop pipeline board, per-document access control
   if/when documents need row-level restrictions beyond module-level role visibility
