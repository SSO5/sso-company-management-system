"use client";
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
import { formatDate } from "@/lib/utils";
import {
  createProgressReportAction,
  deleteProgressReportAction,
  addProgressReportItemAction,
  deleteProgressReportItemAction,
} from "@/server/projects/progress-reports";
import { Plus, CheckCircle2, Circle, Trash2, ChevronDown, ChevronRight, Eye, Download } from "lucide-react";

interface ProgressReportItem {
  id: string;
  partName: string;
  notes: string | null;
  isDone: boolean;
  photoBeforeKey: string | null;
  photoAfterKey: string | null;
}
interface ProgressReport {
  id: string;
  number: string;
  inspectionDate: Date;
  location: string | null;
  preparedBy: { name: string };
  items: ProgressReportItem[];
}

export function ProgressReportPanel({
  projectId,
  reports,
  assignees,
}: {
  projectId: string;
  reports: ProgressReport[];
  assignees: { id: string; name: string }[];
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [itemDialogFor, setItemDialogFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const { toast } = useToast();

  async function onCreateReport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await createProgressReportAction({
      projectId,
      inspectionDate: fd.get("inspectionDate"),
      location: fd.get("location") || null,
      preparedById: fd.get("preparedById"),
    });
    if (res.ok) {
      toast({ title: "Progress report created", variant: "success" });
      setNewOpen(false);
      setExpanded((prev) => ({ ...prev, [res.data.id]: true }));
      router.refresh();
    } else {
      toast({ title: "Unable to create report", description: res.error, variant: "destructive" });
    }
  }

  async function onDeleteReport(id: string) {
    if (!confirm("Delete this progress report and all its checkpoints/photos?")) return;
    const res = await deleteProgressReportAction(id, projectId);
    if (res.ok) { toast({ title: "Report deleted", variant: "success" }); router.refresh(); }
    else toast({ title: "Unable to delete", description: res.error, variant: "destructive" });
  }

  async function onAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await addProgressReportItemAction(fd);
    if (res.ok) {
      toast({ title: "Checkpoint added", variant: "success" });
      setItemDialogFor(null);
      router.refresh();
    } else {
      toast({ title: "Unable to add checkpoint", description: res.error, variant: "destructive" });
    }
  }

  async function onDeleteItem(id: string) {
    if (!confirm("Remove this checkpoint?")) return;
    const res = await deleteProgressReportItemAction(id, projectId);
    if (res.ok) { toast({ title: "Checkpoint removed", variant: "success" }); router.refresh(); }
    else toast({ title: "Unable to remove", description: res.error, variant: "destructive" });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Laporan progress lapangan (ENG-REP) — checklist bagian yang dicek, foto sebelum/sesudah, per kunjungan.
        </p>
        <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-3.5 w-3.5" /> New Report</Button>
      </div>

      <div className="space-y-2">
        {reports.map((r) => {
          const isOpen = expanded[r.id] ?? false;
          const doneCount = r.items.filter((i) => i.isDone).length;
          return (
            <div key={r.id} className="rounded-md border border-border">
              <div
                className="flex cursor-pointer items-center justify-between p-3"
                onClick={() => setExpanded((prev) => ({ ...prev, [r.id]: !isOpen }))}
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{r.number}</p>
                    <p className="text-sm font-medium">{formatDate(r.inspectionDate)}{r.location ? ` — ${r.location}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{doneCount}/{r.items.length} selesai</Badge>
                  <span className="text-xs text-muted-foreground">Disusun oleh {r.preparedBy.name}</span>
                  <a href={`/api/progress-reports/${r.id}/pdf?view=1`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" title="Lihat / Cetak PDF">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <a href={`/api/progress-reports/${r.id}/pdf`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" title="Download PDF">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDeleteReport(r.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-border p-3">
                  <div className="space-y-2">
                    {r.items.map((it) => (
                      <div key={it.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-2">
                        <div className="flex items-start gap-2">
                          {it.isDone ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                          <div>
                            <p className="text-sm font-medium">{it.partName}</p>
                            {it.notes && <p className="text-xs text-muted-foreground">{it.notes}</p>}
                            <div className="mt-1 flex gap-2">
                              {it.photoBeforeKey && (
                                <a href={`/api/progress-reports/photo/${it.photoBeforeKey}`} target="_blank" rel="noreferrer">
                                  <img src={`/api/progress-reports/photo/${it.photoBeforeKey}`} alt="Foto sebelum" className="h-14 w-14 rounded object-cover" />
                                </a>
                              )}
                              {it.photoAfterKey && (
                                <a href={`/api/progress-reports/photo/${it.photoAfterKey}`} target="_blank" rel="noreferrer">
                                  <img src={`/api/progress-reports/photo/${it.photoAfterKey}`} alt="Foto sesudah" className="h-14 w-14 rounded object-cover" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => onDeleteItem(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                    {r.items.length === 0 && <p className="text-sm text-muted-foreground">Belum ada checkpoint.</p>}
                  </div>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setItemDialogFor(r.id)}>
                    <Plus className="h-3.5 w-3.5" /> Add Checkpoint
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {reports.length === 0 && <p className="text-sm text-muted-foreground">No progress reports yet.</p>}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen} title="New Progress Report">
        <form onSubmit={onCreateReport} className="space-y-3">
          <div className="space-y-1"><Label>Tanggal Inspeksi</Label><Input name="inspectionDate" type="date" required /></div>
          <div className="space-y-1"><Label>Lokasi</Label><Input name="location" placeholder="Workshop SSO / Site customer" /></div>
          <div className="space-y-1">
            <Label>Disusun oleh</Label>
            <Select name="preparedById" required>
              <option value="">Pilih user</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button type="submit">Create Report</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={itemDialogFor !== null} onOpenChange={(o) => !o && setItemDialogFor(null)} title="Add Checkpoint">
        <form onSubmit={onAddItem} encType="multipart/form-data" className="space-y-3">
          <input type="hidden" name="progressReportId" value={itemDialogFor ?? ""} />
          <div className="space-y-1"><Label>Bagian yang dicek</Label><Input name="partName" required placeholder="e.g. Bearing 6313 SKF ZZ C3" /></div>
          <div className="space-y-1"><Label>Keterangan</Label><Textarea name="notes" placeholder="e.g. Bearing dikirim supplier tgl. 11/8" /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="isDone" id="isDone" className="h-4 w-4" />
            <Label htmlFor="isDone" className="!mb-0">Selesai</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Foto Sebelum</Label><Input name="photoBefore" type="file" accept="image/*" /></div>
            <div className="space-y-1"><Label>Foto Sesudah</Label><Input name="photoAfter" type="file" accept="image/*" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setItemDialogFor(null)}>Cancel</Button>
            <Button type="submit">Add Checkpoint</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
