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
