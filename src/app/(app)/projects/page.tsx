import Link from "next/link";
import { listProjects } from "@/server/projects/projects";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  PLANNING: "secondary", ACTIVE: "default", ON_HOLD: "warning", AT_RISK: "destructive",
  COMPLETED: "success", CANCELLED: "destructive", CLOSED: "outline",
};

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Projects</h1>
        <p className="text-sm text-muted-foreground">
          {projects.length} project(s). Projects are created automatically when a quotation is marked Won.
        </p>
      </div>

      {projects.length === 0 ? (
        <EmptyState title="No projects yet" description="Mark a quotation Won to auto-generate the first project." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead><TableHead>Name</TableHead><TableHead>Customer</TableHead>
              <TableHead>PM</TableHead><TableHead>Contract Value</TableHead><TableHead>Progress</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs"><Link href={`/projects/${p.id}`} className="hover:underline">{p.number}</Link></TableCell>
                <TableCell className="max-w-[220px] truncate">{p.name}</TableCell>
                <TableCell>{p.customer.companyName}</TableCell>
                <TableCell>{p.projectManager?.name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                <TableCell>{formatCurrency(Number(p.contractValue))}</TableCell>
                <TableCell>{p.progressPercent}%</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
