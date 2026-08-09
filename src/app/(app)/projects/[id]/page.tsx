import { getProjectDetail } from "@/server/projects/projects";
import { listUsersForPicker } from "@/server/settings/users";
import { requireUser } from "@/lib/auth/current-user";
import { Badge } from "@/components/ui/badge";
import { ProjectDetailTabs } from "@/components/projects/project-detail-tabs";
import { JobNumberField } from "@/components/projects/job-number-field";
import Link from "next/link";
import { FolderOpen } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  PLANNING: "secondary", ACTIVE: "default", ON_HOLD: "warning", AT_RISK: "destructive",
  COMPLETED: "success", CANCELLED: "destructive", CLOSED: "outline",
};

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [{ project, profitability, closing, opportunityFolder }, actor, assignees] = await Promise.all([
    getProjectDetail(params.id),
    requireUser(),
    listUsersForPicker(),
  ]);

  const canManage = actor.role === "ADMIN" || (actor.role === "PROJECT_MANAGER" && project.projectManagerId === actor.userId);

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{project.number}</p>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[project.status]}>{project.status}</Badge>
          <span className="text-xs text-muted-foreground">{project.customer.companyName}</span>
          <span className="text-xs text-muted-foreground">· PM: {project.projectManager?.name ?? "Unassigned"}</span>
          <JobNumberField projectId={project.id} jobNumber={project.jobNumber} canManage={canManage} />
          {opportunityFolder && (
            <Link href={`/documents/${opportunityFolder.id}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <FolderOpen className="h-3.5 w-3.5" /> Dokumen Sales (pra-Won)
            </Link>
          )}
        </div>
      </div>

      <ProjectDetailTabs
        projectId={project.id}
        status={project.status}
        canManage={canManage}
        profitability={profitability}
        tasks={project.tasks}
        milestones={project.milestones}
        expenses={project.expenses}
        assignees={assignees}
        closing={closing}
      />
    </div>
  );
}
