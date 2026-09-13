import { getWeeklyProject } from "@/server/projects/weekly";
import { getProjectDetail } from "@/server/projects/projects";
import { listUsersForPicker } from "@/server/settings/users";
import { getJobChecklistFor } from "@/server/document-checklist";
import { getProgressReportDocuments } from "@/server/projects/progress-reports";
import { DocumentChecklistPanel } from "@/components/dashboard/document-checklist-panel";
import { requireUser } from "@/lib/auth/current-user";
import { ProjectDetailTabs } from "@/components/projects/project-detail-tabs";
import { JobNumberField } from "@/components/projects/job-number-field";
import { ProjectStatusSelect } from "@/components/projects/project-status-select";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen, TriangleAlert } from "lucide-react";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  if (searchParams.tab === "costs") redirect(`/finance/expenses?project=${params.id}`);
  const [
    {
      project,
      profitability,
      closing,
      opportunityFolder,
      purchaseOrderFolderId,
      sCurve,
      riskSignals,
      salesOrigin,
      billingTimeline,
    },
    actor,
    assignees,
    checklist,
    progressReportDocs,
    weekly,
  ] = await Promise.all([
    getProjectDetail(params.id),
    requireUser(),
    listUsersForPicker(),
    getJobChecklistFor("PROJECT", params.id),
    getProgressReportDocuments(params.id),
    getWeeklyProject(params.id),
  ]);

  const canManage =
    actor.role === "ADMIN" ||
    actor.role === "IT" ||
    (actor.role === "PROJECT_MANAGER" &&
      project.projectManagerId === actor.userId);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/projects"
          className="mb-3 inline-block py-2 text-sm text-primary"
        >
          ← Semua proyek
        </Link>
        <p className="font-mono text-xs text-muted-foreground">
          {project.number}
        </p>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ProjectStatusSelect
            projectId={project.id}
            status={project.status}
            canManage={canManage}
          />
          <span className="text-xs text-muted-foreground">
            {project.customer.companyName}
          </span>
          <span className="text-xs text-muted-foreground">
            · PM: {project.projectManager?.name ?? "Unassigned"}
          </span>
          <JobNumberField
            projectId={project.id}
            jobNumber={project.jobNumber}
            canManage={canManage}
          />
          {opportunityFolder && (
            <Link
              href={`/documents/${opportunityFolder.id}`}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Dokumen Sales (pra-Won)
            </Link>
          )}
        </div>
      </div>

      {/* Above the tabs, not inside one: an outstanding BAST or missing PO is
          the kind of thing that should be visible without first guessing which
          tab hides it. Same reasoning for risk signals — a delayed milestone
          or a budget overrun shouldn't require first guessing which tab it's
          hiding in. This never touches project.status itself (see
          computeProjectRiskSignals) — it's information for the PM to act on,
          not a status the system imposes. */}
      {false && riskSignals.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <TriangleAlert className="h-4 w-4" /> Project ini butuh perhatian
          </p>
          <ul className="ml-5 list-disc space-y-0.5 text-xs text-muted-foreground">
            {riskSignals.map((s, i) => (
              <li key={i}>{s.message}</li>
            ))}
          </ul>
        </div>
      )}

      {checklist && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Kelengkapan dokumen proyek
          </summary>
          <div className="mt-4">
            <DocumentChecklistPanel
              jobs={[checklist]}
              canUpload={actor.role !== "VIEWER"}
            />
          </div>
        </details>
      )}

      <ProjectDetailTabs
        weekly={weekly}
        projectId={project.id}
        customerId={project.customerId}
        purchaseOrderFolderId={purchaseOrderFolderId}
        status={project.status}
        canManage={canManage}
        role={actor.role}
        profitability={profitability}
        tasks={project.tasks}
        milestones={project.milestones}
        sCurve={sCurve}
        expenses={project.expenses}
        assignees={assignees}
        closing={closing}
        opportunity={project.opportunity}
        quotation={project.quotation}
        purchaseOrders={project.purchaseOrders}
        vendorPurchaseOrders={project.vendorPurchaseOrders}
        invoices={project.invoices}
        salesOrigin={salesOrigin}
        billingTimeline={billingTimeline}
        progressReportFolderId={progressReportDocs.folderId}
        progressReportDocuments={progressReportDocs.documents}
      />
    </div>
  );
}
