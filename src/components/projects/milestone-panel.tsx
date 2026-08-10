"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createMilestone, updateMilestoneStatus } from "@/server/projects/tasks";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Plus, CheckCircle2, Circle, Clock } from "lucide-react";

interface Milestone { id: string; name: string; status: string; dueDate: Date | null; progressPercent: number; weightPercent: unknown }

export function MilestonePanel({ projectId, milestones }: { projectId: string; milestones: Milestone[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await createMilestone({ ...Object.fromEntries(fd.entries()), projectId });
    if (res.ok) { toast({ title: "Milestone added", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Unable to add milestone", description: res.error, variant: "destructive" });
  }

  const totalWeight = milestones.reduce((s, m) => s + Number(m.weightPercent), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Total bobot: <span className={totalWeight === 100 ? "font-medium text-foreground" : "font-medium text-warning"}>{totalWeight}%</span>
          {totalWeight !== 100 && milestones.length > 0 && (
            <span className="ml-1">— idealnya 100% agar Kurva S akurat</span>
          )}
        </p>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Milestone</Button>
      </div>
      <div className="space-y-2">
        {milestones.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              {m.status === "COMPLETED" ? <CheckCircle2 className="h-4 w-4 text-success" /> : m.status === "IN_PROGRESS" ? <Clock className="h-4 w-4 text-warning" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.dueDate ? `Due ${formatDate(m.dueDate)}` : "No due date"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{Number(m.weightPercent)}%</Badge>
              <Select
                className="h-7 w-32 text-xs"
                defaultValue={m.status}
                onChange={async (e) => {
                  const res = await updateMilestoneStatus(m.id, projectId, e.target.value as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "DELAYED");
                  if (res.ok) router.refresh();
                  else toast({ title: "Unable to update", description: res.error, variant: "destructive" });
                }}
              >
                <option value="PENDING">Pending</option><option value="IN_PROGRESS">In Progress</option><option value="COMPLETED">Completed</option><option value="DELAYED">Delayed</option>
              </Select>
            </div>
          </div>
        ))}
        {milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones yet.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen} title="New Milestone">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input name="name" required /></div>
          <div className="space-y-1"><Label>Due Date</Label><Input name="dueDate" type="date" /></div>
          <div className="space-y-1">
            <Label>Bobot (% dari total project) <span className="text-muted-foreground">— untuk Kurva S</span></Label>
            <Input name="weightPercent" type="number" min={0} max={100} step="0.01" defaultValue={0} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Add Milestone</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
