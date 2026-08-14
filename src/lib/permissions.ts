import type { UserRole } from "@prisma/client";

/**
 * Server-side authorization matrix (section 3 / 51 of the spec).
 * This is the SINGLE source of truth for who can do what. UI hides buttons
 * for convenience, but every server action / route handler must call
 * requirePermission() — never rely on the client to enforce this.
 */

export type Module =
  | "sales"
  | "finance"
  | "project"
  | "documents"
  | "reports"
  | "users"
  | "settings"
  | "activityLog";

export type Action = "view" | "create" | "update" | "delete" | "approve" | "close" | "manage";

type PermissionMatrix = Record<UserRole, Partial<Record<Module, Action[]>>>;

const ALL: Action[] = ["view", "create", "update", "delete", "approve", "close", "manage"];

const MATRIX: PermissionMatrix = {
  ADMIN: {
    sales: ALL,
    finance: ALL,
    project: ALL,
    documents: ALL,
    reports: ALL,
    users: ALL,
    settings: ALL,
    activityLog: ["view"],
  },
  SALES: {
    sales: ["view", "create", "update", "approve"], // "approve" here == submit-for-approval / mark won-lost, not final Admin approval
    finance: ["view"],
    project: ["view"],
    documents: ["view", "create"],
    reports: ["view"],
  },
  FINANCE: {
    sales: ["view"],
    finance: ["view", "create", "update", "manage"],
    project: ["view"],
    documents: ["view", "create"],
    reports: ["view"],
  },
  PROJECT_MANAGER: {
    sales: ["view"],
    finance: ["view"],
    project: ["view", "create", "update", "close"],
    documents: ["view", "create"],
    reports: ["view"],
  },
  // Non-operational oversight role (e.g. Direktur who isn't day-to-day
  // executive): can see everything relevant, cannot create/edit/approve/
  // delete/manage/close anything. Deliberately excludes "users"/"settings"/
  // "activityLog" — this is a reporting/oversight seat, not an admin seat.
  VIEWER: {
    sales: ["view"],
    finance: ["view"],
    project: ["view"],
    documents: ["view"],
    reports: ["view"],
  },
  // Technical/data-integrity seat (Aug 2026): can view+edit+delete records
  // across every operational module, and has full control ("manage") over
  // Documents specifically — renaming, re-filing, and renumbering are exactly
  // what this role exists for, since automated import/OCR occasionally reads
  // an upload wrong and nobody else is allowed to touch a submitted/locked
  // record to fix it.
  //
  // Two things are deliberately withheld, on purpose, not by oversight:
  //  - "approve": financial/commercial sign-off (Quotation, Vendor PO,
  //    Invoice, Expense) must stay a business decision made by ADMIN
  //    (Direktur) alone — see requireApprover(). A technical role correcting
  //    a document number must never be able to also wave it through.
  //  - "users": account creation/role changes stay an organizational
  //    decision for ADMIN, not a technical one — IT can still VIEW the user
  //    list (e.g. to know who to route a fix to) via the "users" grant below,
  //    add separately in the matrix note.
  // The actual override of the "only DRAFT records are editable" rule lives
  // in lib/workflows/corrections.ts, gated by requireDataCorrector() — this
  // matrix grant alone does not unlock editing a SENT/WON quotation; it only
  // covers ordinary CRUD on records still in an editable state.
  IT: {
    sales: ["view", "update", "delete", "manage"],
    finance: ["view", "update", "delete", "manage"],
    project: ["view", "update", "delete", "manage"],
    documents: ["view", "create", "update", "delete", "manage"],
    reports: ["view"],
    users: ["view"],
    // "manage" deliberately withheld: settings/company.ts uses this same
    // grant for letterhead/tax-default/numbering-prefix changes, which are
    // company policy decisions for ADMIN, not a technical correction. IT's
    // actual settings surface (Storage Health, Numbering lookup, Koreksi
    // Dokumen) is either view-only or checked by its own dedicated guard —
    // see storage-health.ts and requireDataCorrector().
    settings: ["view"],
    activityLog: ["view"],
  },
};

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function can(role: UserRole, module: Module, action: Action): boolean {
  return Boolean(MATRIX[role]?.[module]?.includes(action));
}

/** Throws ForbiddenError (caught by the server action wrapper) if not permitted. */
export function requirePermission(role: UserRole, module: Module, action: Action) {
  if (!can(role, module, action)) {
    throw new ForbiddenError(
      `Role ${role} is not permitted to ${action} on ${module}.`
    );
  }
}

/**
 * Maker-checker guard shared by every approval flow (Quotation, Vendor PO,
 * Project Expense, Invoice): the approver must hold the approver role AND
 * must never be the same person who submitted the request — even an Admin
 * cannot approve their own submission.
 *
 * Org note (Aug 2026): SSO's real Direktur-level people (Dirut, CFO+COO,
 * General Manager) are all mapped onto the ADMIN role below, so any one of
 * them may approve another's submission — this is intentional (no single
 * point of failure/bottleneck), not a bug. A Direktur who is NOT part of
 * daily operations should get VIEWER instead, which cannot approve anything.
 * If SSO later wants a stricter "only the Dirut personally" or a value-based
 * two-tier approval, that needs a dedicated check here (e.g. against
 * User.title or a value threshold) — flag this to the founder before
 * changing, since it re-introduces a single-person dependency.
 */
function requireApprover(role: UserRole, actorId: string, submittedById: string | null, label: string) {
  if (role !== "ADMIN") {
    throw new ForbiddenError(`Only Admin (Direktur) can approve or reject ${label}.`);
  }
  if (submittedById && actorId === submittedById) {
    throw new ForbiddenError(`You cannot approve your own ${label} submission. Ask another Admin (Direktur) to review it.`);
  }
}

/** Quotation approval is Admin-only regardless of the general "sales" matrix. */
export function requireQuotationApprover(role: UserRole, actorId: string, submittedById: string | null = null) {
  requireApprover(role, actorId, submittedById, "a quotation");
}

/** Vendor PO approval — same rule as Quotation, applied to procurement. */
export function requireVendorPOApprover(role: UserRole, actorId: string, submittedById: string | null = null) {
  requireApprover(role, actorId, submittedById, "a vendor purchase order");
}

/** Project Expense approval — same rule, applied to project cost control. */
export function requireExpenseApprover(role: UserRole, actorId: string, submittedById: string | null = null) {
  requireApprover(role, actorId, submittedById, "a project expense");
}

/** Invoice approval — same rule, applied before an invoice can be sent. */
export function requireInvoiceApprover(role: UserRole, actorId: string, submittedById: string | null = null) {
  requireApprover(role, actorId, submittedById, "an invoice");
}

/** Only Admin or the assigned Project Manager may close a project. */
export function requireProjectCloser(role: UserRole, isAssignedPM: boolean) {
  if (role !== "ADMIN" && !(role === "PROJECT_MANAGER" && isAssignedPM)) {
    throw new ForbiddenError("Only Admin or the assigned Project Manager can close this project.");
  }
}

/**
 * Gate for lib/workflows/corrections.ts — the ONLY place in the app allowed
 * to edit a document's identity (its number, its file name, which
 * folder/project it's filed under) after that document is no longer in
 * DRAFT/editable state. Every other workflow (quotation.ts, vendor-po.ts,
 * finance.ts, progress-reports.ts) refuses to touch a submitted/approved/won
 * record — that lock is what keeps a financial document trustworthy once
 * it's out the door. This function is the single, explicit, logged exception
 * to that lock, and it exists only to fix mistakes the automated import/OCR
 * pipeline made (duplicate numbers, a report filed under the wrong project,
 * a mis-OCR'd file name) — not to let anyone quietly rewrite history.
 *
 * Restricted to ADMIN and IT. Both roles are logged by name on every use via
 * logActivity — this is corrective, not silent.
 */
export function requireDataCorrector(role: UserRole) {
  if (role !== "ADMIN" && role !== "IT") {
    throw new ForbiddenError(
      "Only Admin or IT can correct a document's number, file name, or filing after it has been submitted."
    );
  }
}
