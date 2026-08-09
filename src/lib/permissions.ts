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

/** Quotation approval is Admin-only regardless of the general "sales" matrix. */
export function requireQuotationApprover(role: UserRole) {
  if (role !== "ADMIN") {
    throw new ForbiddenError("Only Admin can approve or reject a quotation.");
  }
}

/** Only Admin or the assigned Project Manager may close a project. */
export function requireProjectCloser(role: UserRole, isAssignedPM: boolean) {
  if (role !== "ADMIN" && !(role === "PROJECT_MANAGER" && isAssignedPM)) {
    throw new ForbiddenError("Only Admin or the assigned Project Manager can close this project.");
  }
}
