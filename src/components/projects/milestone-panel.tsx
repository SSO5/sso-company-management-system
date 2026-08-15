"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createMilestone, updateMilestone, updateMilestoneStatus, deleteMilestone } from "@/server/projects/tasks";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Plus, CheckCircle2, Circle, Clock, Pencil, Trash2 } from "lucide-react";

interface Milestone {
  id: string; name: string; status: string; dueDate: Date | null;
  progressPercent: number; weightPercent: unknown; description: string | null;
  sourcePurchaseOrderId: string | null; dateBasis: string | null;
  sourcePurchaseOrder: { number: string } | null;
}

const DATE_BASIS_LABEL: Record<string, string> = {
  PO_DATE: "tanggal PO (DP)",
  ESTIMATED_DELIVERY: "perkiraan tanggal kirim",
};

function toDateInputValue(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function MilestonePanel({ projectId, milestones }: { projectId: string; milestones: Milestone[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await createMilestone({ ...Object.fromEntries(fd.entries()), projectId });
    if (res.ok) { toast({ title: "Milestone added", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Unable to add milestone", description: res.error, variant: "destructive" });
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    setPending(true);
    const res = await updateMilestone(editing.id, projectId, Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) { toast({ title: "Milestone diperbarui", variant: "success" }); setEditing(null); router.refresh(); }
    else toast({ title: "Tidak bisa memperbarui", description: res.error, variant: "destructive" });
  }

  async function onDelete(m: Milestone) {
    if (!window.confirm(`Hapus milestone "${m.name}"? Bobotnya akan hilang dari Kurva S.`)) return;
    const res = await deleteMilestone(m.id, projectId);
    if (res.ok) { toast({ title: "Milestone dihapus", variant: "success" }); router.refresh(); }
    else toast({ title: "Tidak bisa menghapus", description: res.error, variant: "destructive" });
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
                {m.sourcePurchaseOrder && (
                  <p className="text-[11px] text-muted-foreground">
                    Mengikuti {m.dateBasis ? DATE_BASIS_LABEL[m.dateBasis] ?? "PO" : "PO"} {m.sourcePurchaseOrder.number}
                  </p>
                )}
                {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
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
              <Button size="icon" variant="ghost" title="Edit" onClick={() => setEditing(m)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" title="Hapus" onClick={() => onDelete(m)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones yet.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen} title="New Milestone">
        <form onSubmit={onCreate} className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input name="name" required /></div>
          <div className="space-y-1"><Label>Due Date</Label><Input name="dueDate" type="date" /></div>
          <div className="space-y-1">
            <Label>Bobot (% dari total project) <span className="text-muted-foreground">— untuk Kurva S</span></Label>
            <Input name="weightPercent" type="number" min={0} max={100} step="0.01" defaultValue={0} />
          </div>
          <div className="space-y-1"><Label>Keterangan (opsional)</Label><Input name="description" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Add Milestone</Button>
          </div>
        </form>
      </Dialog>

      {/* Manual editing — nama/tanggal/bobot semuanya bisa diubah di sini, dan
          begitu disimpan otomatis ikut ke Kurva S / dashboard karena
          computeSCurve selalu membaca data terbaru, tidak ada langkah
          "hitung ulang" terpisah. */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit Milestone">
        {editing && (
          <form key={editing.id} onSubmit={onEdit} className="space-y-3">
            <div className="space-y-1"><Label>Jenis Pekerjaan / Nama</Label><Input name="name" required defaultValue={editing.name} /></div>
            <div className="space-y-1">
              <Label>Tanggal (mis. tanggal DP — dasar penagihan)</Label>
              {editing.sourcePurchaseOrder ? (
                <>
                  <Input type="date" defaultValue={toDateInputValue(editing.dueDate)} disabled />
                  <p className="text-[11px] text-muted-foreground">
                    Tanggal ini mengikuti {editing.dateBasis ? DATE_BASIS_LABEL[editing.dateBasis] ?? "PO" : "PO"}{" "}
                    {editing.sourcePurchaseOrder.number} — ubah dari tombol Edit PO di tab Documents, bukan di sini, supaya
                    tidak ada dua sumber tanggal yang berbeda.
                  </p>
                </>
              ) : (
                <Input name="dueDate" type="date" defaultValue={toDateInputValue(editing.dueDate)} />
              )}
            </div>
            <div className="space-y-1">
              <Label>Bobot (% dari total project) <span className="text-muted-foreground">— untuk Kurva S</span></Label>
              <Input name="weightPercent" type="number" min={0} max={100} step="0.01" defaultValue={Number(editing.weightPercent)} />
            </div>
            <div className="space-y-1"><Label>Keterangan (opsional)</Label><Input name="description" defaultValue={editing.description ?? ""} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Batal</Button>
              <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan Perubahan"}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
