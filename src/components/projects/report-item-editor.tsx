"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { updateProgressReportItemAction } from "@/server/projects/progress-reports";
import type { WeeklyItem } from "@/lib/weekly-comparison";
export function ReportItemEditor({ projectId, items }: { projectId: string; items: WeeklyItem[] }) {
  const [pending, setPending] = useState(false), router = useRouter(), { toast } = useToast();
  return <details className="mt-5 border-t pt-4"><summary className="cursor-pointer py-2 text-sm font-semibold">Koreksi rincian hasil pembacaan ({items.length})</summary><p className="my-3 text-xs text-muted-foreground">Isi harus mengikuti bukti. Koreksi draf memerlukan persetujuan baru; file asli tetap tersimpan.</p><div className="space-y-3">{items.map(item => <details key={item.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">{item.sectionName} · {item.partName}</summary><form className="mt-3 space-y-3" onSubmit={async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("isDone", fd.get("done") === "on" ? "true" : "false"); setPending(true); try { const result = await updateProgressReportItemAction(item.id, projectId, fd); if (!result.ok) throw new Error(result.error); router.refresh(); toast({ title: "Rincian disimpan", variant: "success" }); } catch (error) { toast({ title: "Belum tersimpan", description: error instanceof Error ? error.message : "Coba lagi", variant: "destructive" }); } finally { setPending(false); } }}><label className="block text-sm">Komponen / pekerjaan<Input name="partName" required defaultValue={item.partName}/></label><label className="block text-sm">Keterangan sumber<Textarea name="notes" defaultValue={item.notes ?? ""}/></label><label className="flex min-h-11 items-center gap-3 text-sm"><input name="done" type="checkbox" defaultChecked={item.isDone}/>Sumber secara jelas menyatakan selesai</label><Button disabled={pending} variant="outline">Simpan koreksi item</Button></form></details>)}</div></details>;
}
