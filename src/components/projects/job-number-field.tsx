"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { updateProject } from "@/server/projects/projects";
import { Pencil, Check, X } from "lucide-react";

/**
 * "Job Number" (spec: found in SSO's own real job-costing spreadsheet as
 * "NO JO" — a short internal code like "226" or "BPN-0505", assigned by
 * whoever books the job into cost tracking). Deliberately a plain editable
 * text field, not auto-generated — real usage mixes quotation-derived,
 * PO-derived, and site-prefixed codes with no single fixed pattern.
 */
export function JobNumberField({ projectId, jobNumber, canManage }: { projectId: string; jobNumber: string | null; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(jobNumber ?? "");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function save() {
    setPending(true);
    const res = await updateProject(projectId, { jobNumber: value || null });
    setPending(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      toast({ title: "Unable to save Job Number", description: res.error, variant: "destructive" });
    }
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        Job Number: <span className="font-mono">{jobNumber || "—"}</span>
        {canManage && (
          <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground">
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 226 or BPN-0505" className="h-6 w-32 text-xs" />
      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={pending} onClick={save}><Check className="h-3 w-3" /></Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditing(false); setValue(jobNumber ?? ""); }}><X className="h-3 w-3" /></Button>
    </span>
  );
}
