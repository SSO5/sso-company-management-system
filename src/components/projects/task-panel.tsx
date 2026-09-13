"use client";
import { displayLabel } from "@/lib/display-labels";
import { can } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { createTask, updateTaskStatus } from "@/server/projects/tasks";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { TaskStatus } from "@prisma/client";

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  dueDate: Date | null;
  progressPercent: number;
  assignedTo: { name: string } | null;
}

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"];
const PRIORITY_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "warning",
  CRITICAL: "destructive",
};

export function TaskPanel({
  projectId,
  tasks,
  assignees,
  role,
}: {
  role: UserRole;
  projectId: string;
  tasks: Task[];
  assignees: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = { ...Object.fromEntries(fd.entries()), projectId };
    const res = await createTask(payload);
    if (res.ok) {
      toast({ title: "Tugas ditambahkan", variant: "success" });
      setOpen(false);
      router.refresh();
    } else
      toast({
        title: "Tidak dapat menambah tugas",
        description: res.error,
        variant: "destructive",
      });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          disabled={!can(role, "project", "create")}
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Tambah Tugas
        </Button>
      </div>
      {tasks.length === 0 && (
        <p className="text-sm text-muted-foreground">Belum ada tugas.</p>
      )}
      <div className="space-y-2">
        {tasks.map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap gap-3 items-center justify-between rounded-md border border-border p-3"
          >
            <div>
              <p className="text-sm font-medium">{t.title}</p>
              <p className="text-xs text-muted-foreground">
                {t.assignedTo?.name ?? "Belum ditugaskan"}{" "}
                {t.dueDate && `· Target ${formatDate(t.dueDate)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={PRIORITY_VARIANT[t.priority]}>{displayLabel(t.priority)}</Badge>
              <Select
                className="h-7 w-32 text-xs"
                disabled={!can(role, "project", "update")}
                aria-label="Ubah status tugas"
                value={t.status}
                onChange={async (e) => {
                  const res = await updateTaskStatus(
                    t.id,
                    projectId,
                    e.target.value as TaskStatus,
                  );
                  if (res.ok) router.refresh();
                  else
                    toast({
                      title: "Tidak dapat memperbarui tugas",
                      description: res.error,
                      variant: "destructive",
                    });
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {displayLabel(s)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen} title="Tugas Baru">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Judul</Label>
            <Input name="title" required />
          </div>
          <div className="space-y-1">
            <Label>Keterangan</Label>
            <Textarea name="description" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Penanggung Jawab</Label>
              <Select name="assignedToId" defaultValue="">
                <option value="">Belum ditugaskan</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Prioritas</Label>
              <Select name="priority" defaultValue="MEDIUM">
                <option value="LOW">Rendah</option>
                <option value="MEDIUM">Sedang</option>
                <option value="HIGH">Tinggi</option>
                <option value="CRITICAL">Mendesak</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tanggal Mulai</Label>
              <Input name="startDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label>Tanggal Target</Label>
              <Input name="dueDate" type="date" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit">Tambah Tugas</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
