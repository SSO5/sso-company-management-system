"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus, UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createTask, updateTaskStatus } from "@/server/projects/tasks";
import { formatDate } from "@/lib/utils";
import { isUntouchedTemplateTask } from "@/lib/weekly-policy";
type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  dueDate: Date | null;
  assignedTo: { name: string } | null;
  assignedToId?: string | null;
  description?: string | null;
  notes?: string | null;
};
const labels: Record<TaskStatus, string> = {
  TODO: "Perlu dikerjakan",
  IN_PROGRESS: "Sedang ditangani",
  BLOCKED: "Ada hambatan",
  COMPLETED: "Selesai",
};
export function TaskPanel({
  projectId,
  tasks,
  assignees,
  role,
  actorId,
}: {
  projectId: string;
  tasks: Task[];
  assignees: { id: string; name: string }[];
  role: UserRole;
  actorId: string;
}) {
  const [create, setCreate] = useState(false),
    [edit, setEdit] = useState<Task | null>(null),
    [pending, setPending] = useState(false),
    [filter, setFilter] = useState("open");
  const router = useRouter(),
    { toast } = useToast(),
    manager = ["ADMIN", "PROJECT_MANAGER"].includes(role);
  const legacy = tasks.filter(isUntouchedTemplateTask),
    actual = tasks.filter((t) => !isUntouchedTemplateTask(t));
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    try {
      const result = edit
        ? await updateTaskStatus(
            edit.id,
            projectId,
            String(fd.get("status")) as TaskStatus,
            String(fd.get("notes") || ""),
          )
        : await createTask({
            projectId,
            title: fd.get("title"),
            description: fd.get("description"),
            assignedToId: fd.get("owner"),
            dueDate: fd.get("due") ? `${fd.get("due")}T17:00:00+07:00` : null,
            priority: "MEDIUM",
          });
      if (!result.ok) throw new Error(result.error);
      setCreate(false);
      setEdit(null);
      router.refresh();
      toast({ title: "Tindak lanjut tersimpan", variant: "success" });
    } catch (error) {
      toast({
        title: "Belum tersimpan",
        description: error instanceof Error ? error.message : "Coba lagi",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Apa yang perlu diselesaikan?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Setiap tindak lanjut memiliki PIC, target, dan hasil yang terlihat
            oleh tim.
          </p>
        </div>
        {manager && (
          <Button onClick={() => setCreate(true)}>Tambah tindak lanjut</Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["open", "Belum selesai"],
          ["mine", "Tanggung jawab saya"],
          ["done", "Sudah selesai"],
        ].map(([id, label]) => (
          <Button
            key={id}
            variant={filter === id ? "default" : "outline"}
            onClick={() => setFilter(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="space-y-3">
        {actual
          .filter((t) =>
            filter === "mine"
              ? t.assignedToId === actorId && t.status !== "COMPLETED"
              : filter === "done"
                ? t.status === "COMPLETED"
                : t.status !== "COMPLETED",
          )
          .map((t) => (
            <article key={t.id} className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-xs font-semibold ${t.status === "BLOCKED" ? "text-amber-700" : "text-primary"}`}
                  >
                    {labels[t.status]}
                  </p>
                  <h3 className="mt-1 font-semibold">{t.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t.assignedTo?.name || "PIC belum ditetapkan"} ·{" "}
                    {t.dueDate
                      ? `Target ${formatDate(t.dueDate)}`
                      : "Target belum ditetapkan"}
                  </p>
                </div>
                {(manager || t.assignedToId === actorId) && (
                  <Button variant="outline" onClick={() => setEdit(t)}>
                    Catat perkembangan
                  </Button>
                )}
              </div>
              {t.description && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer py-2 text-muted-foreground">
                    Konteks dan bukti sumber
                  </summary>
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3">
                    {t.description}
                  </p>
                </details>
              )}
              {t.notes && (
                <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm">
                  <p className="text-xs font-semibold text-primary">
                    Catatan terakhir
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{t.notes}</p>
                </div>
              )}
            </article>
          ))}
      </div>
      {!actual.length && (
        <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
          Belum ada tindak lanjut nyata. Buat dari temuan pada Progres Mingguan,
          atau tambahkan pekerjaan yang memang diperlukan.
        </div>
      )}
      {!!legacy.length && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Tugas template lama ({legacy.length})
          </summary>
          <p className="my-3 text-xs text-muted-foreground">
            Tersimpan sebagai riwayat. Belum memiliki PIC, tenggat, atau hasil;
            tidak dipakai untuk menilai progres.
          </p>
          {legacy.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-sm"
            >
              <span>{t.title}</span>
              {manager && (
                <Button variant="outline" onClick={() => setEdit(t)}>
                  Catat perkembangan
                </Button>
              )}
            </div>
          ))}
        </details>
      )}
      <Dialog
        open={create || Boolean(edit)}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setCreate(false);
            setEdit(null);
          }
        }}
        title={edit ? "Catat perkembangan" : "Tindak lanjut baru"}
      >
        <form onSubmit={submit} className="space-y-4">
          {edit ? (
            <>
              <p className="font-medium">{edit.title}</p>
              <label className="block text-sm">
                Status
                <Select name="status" defaultValue={edit.status}>
                  {Object.entries(labels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block text-sm">
                Hasil, hambatan, atau langkah berikutnya
                <Textarea
                  name="notes"
                  defaultValue={edit.notes ?? ""}
                  required
                  placeholder="Apa yang sudah dilakukan dan apa yang perlu dilanjutkan?"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm">
                Pekerjaan yang perlu diselesaikan
                <Input name="title" required />
              </label>
              <label className="block text-sm">
                Konteks / hasil yang diharapkan
                <Textarea name="description" />
              </label>
              <label className="block text-sm">
                PIC
                <Select name="owner" required defaultValue="">
                  <option value="" disabled>
                    Pilih penanggung jawab
                  </option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block text-sm">
                Target
                <Input name="due" type="date" required />
              </label>
            </>
          )}
          <Button disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
