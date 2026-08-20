"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { updateProject } from "@/server/projects/projects";

// Manual operational phase, PM's call (founder: "manual saja" — no
// automatic trigger off e.g. DP payment). COMPLETED and CLOSED are
// deliberately excluded: those go through their own gated actions in the
// Closing tab (Mark Completed / Close Project) — see updateProject's guard.
const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "AT_RISK", "CANCELLED"] as const;

const VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  PLANNING: "secondary", ACTIVE: "default", ON_HOLD: "warning", AT_RISK: "destructive",
  COMPLETED: "success", CANCELLED: "destructive", CLOSED: "outline",
};

export function ProjectStatusSelect({ projectId, status, canManage }: { projectId: string; status: string; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  if (!canManage || status === "COMPLETED" || status === "CLOSED") {
    return <Badge variant={VARIANT[status]}>{status}</Badge>;
  }

  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(async () => {
          const res = await updateProject(projectId, { status: value });
          if (res.ok) router.refresh();
          else toast({ title: "Unable to update status", description: res.error, variant: "destructive" });
        });
      }}
      className="h-7 text-xs"
    >
      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
    </Select>
  );
}
