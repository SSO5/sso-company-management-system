const templateTitles = new Set([
  "Kickoff meeting with customer",
  "Prepare project plan & timeline",
  "Assign project team",
  "Set up project documentation folder",
]);
export function isUntouchedTemplateTask(task: {
  title: string;
  status: string;
  dueDate?: Date | null;
  assignedTo?: unknown;
  assignedToId?: string | null;
  notes?: string | null;
  description?: string | null;
}) {
  return (
    templateTitles.has(task.title) &&
    task.status === "TODO" &&
    !task.dueDate &&
    !task.assignedTo &&
    !task.assignedToId &&
    !task.notes &&
    !task.description
  );
}
export function canDecideWeeklyReport(
  actorId: string,
  approverId: string,
  status: string,
  submittedFingerprint: string,
  currentFingerprint: string,
) {
  return (
    actorId === approverId &&
    status === "PENDING" &&
    submittedFingerprint === currentFingerprint
  );
}
export function canDispatchWeeklyReport(
  status: string,
  submittedFingerprint: string,
  currentFingerprint: string,
) {
  return status === "APPROVED" && submittedFingerprint === currentFingerprint;
}
export function parseReportDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+07:00`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}
