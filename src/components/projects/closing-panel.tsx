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
      <p className="rounded-xl border bg-slate-50 p-4 text-sm leading-relaxed">Pemeriksaan ini otomatis. Aturan lama sistem memakai minimal satu invoice terbit dan penyelesaian 50% nilainya; ini bukan bukti pelunasan kontrak atau persetujuan keuangan. Tinjau seluruh tagihan, kewajiban, dan bukti pekerjaan sebelum menutup proyek.</p>
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
          Proyek belum dapat ditutup. Lengkapi persyaratan yang belum terpenuhi di atas.
        </p>
      )}

      {canManage && status !== "CLOSED" && (
        <div className="flex flex-wrap gap-2">
          {status !== "COMPLETED" && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const res = await markCompletedAction(projectId);
                setPending(false);
                if (res.ok) router.refresh();
                else toast({ title: "Tidak dapat menandai selesai", description: res.error, variant: "destructive" });
              }}
            >
              Tandai Selesai
            </Button>
          )}
          <Button
            disabled={!canClose || pending}
            onClick={async () => {
              setPending(true);
              const res = await closeProjectAction(projectId);
              setPending(false);
              if (res.ok) { toast({ title: "Proyek ditutup dan diarsipkan", variant: "success" }); router.refresh(); }
              else toast({ title: "Proyek belum dapat ditutup", description: res.error, variant: "destructive" });
            }}
          >
            Tutup Proyek
          </Button>
        </div>
      )}
      {status === "CLOSED" && <p className="text-sm text-success">Proyek sudah ditutup dan diarsipkan.</p>}
    </div>
  );
}
