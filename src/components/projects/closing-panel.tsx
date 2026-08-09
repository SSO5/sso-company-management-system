"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { closeProjectAction, markCompletedAction } from "@/server/projects/projects";
import { CheckCircle2, XCircle } from "lucide-react";

interface Checklist { key: string; label: string; passed: boolean }

export function ClosingPanel({
  projectId, checklist, canClose, status, canManage,
}: {
  projectId: string; checklist: Checklist[]; canClose: boolean; status: string; canManage: boolean;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {checklist.map((c) => (
          <div key={c.key} className="flex items-center gap-2 text-sm">
            {c.passed ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
            <span className={c.passed ? "" : "text-muted-foreground"}>{c.label}</span>
          </div>
        ))}
      </div>

      {!canClose && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Project cannot be closed yet. Complete the missing items above.
        </p>
      )}

      {canManage && status !== "CLOSED" && (
        <div className="flex gap-2">
          {status !== "COMPLETED" && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const res = await markCompletedAction(projectId);
                setPending(false);
                if (res.ok) router.refresh();
                else toast({ title: "Unable to mark completed", description: res.error, variant: "destructive" });
              }}
            >
              Mark Completed
            </Button>
          )}
          <Button
            disabled={!canClose || pending}
            onClick={async () => {
              setPending(true);
              const res = await closeProjectAction(projectId);
              setPending(false);
              if (res.ok) { toast({ title: "Project closed and archived", variant: "success" }); router.refresh(); }
              else toast({ title: "Project cannot be closed", description: res.error, variant: "destructive" });
            }}
          >
            Close Project
          </Button>
        </div>
      )}
      {status === "CLOSED" && <p className="text-sm text-success">This project is closed and archived.</p>}
    </div>
  );
}
