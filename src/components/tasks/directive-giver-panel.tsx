"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { createDirectiveAction } from "@/server/directives";
import { formatDate } from "@/lib/utils";
import { Send, Users } from "lucide-react";

interface AssignableUser {
  id: string;
  name: string;
  role: string;
}

interface GivenBatch {
  batchId: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  createdAt: Date;
  recipients: { name: string; status: string; completedAt: Date | null; response: string | null; respondedAt: Date | null }[];
}

const ROLE_LABEL: Record<string, string> = {
  SALES: "Sales", FINANCE: "Finance", PROJECT_MANAGER: "PM",
};

export function DirectiveGiverPanel({
  assignableUsers,
  given,
}: {
  assignableUsers: AssignableUser[];
  given: GivenBatch[];
}) {
  const [tab, setTab] = useState("new");
  const [targetType, setTargetType] = useState<"USER" | "ROLE" | "ALL">("ALL");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") || "").trim();
    const description = String(fd.get("description") || "").trim();
    const dueDateRaw = String(fd.get("dueDate") || "");

    const target =
      targetType === "USER"
        ? { type: "USER" as const, userId: String(fd.get("userId") || "") }
        : targetType === "ROLE"
        ? { type: "ROLE" as const, role: String(fd.get("role") || "SALES") as "SALES" | "FINANCE" | "PROJECT_MANAGER" }
        : { type: "ALL" as const };

    setPending(true);
    const res = await createDirectiveAction({
      title,
      description: description || null,
      dueDate: dueDateRaw || null,
      target,
    });
    setPending(false);
    if (res.ok) {
      toast({ title: `Tugas terkirim ke ${res.data.recipientCount} orang`, variant: "success" });
      (document.getElementById("directive-form") as HTMLFormElement | null)?.reset();
      setTab("given");
      router.refresh();
    } else {
      toast({ title: "Tidak bisa mengirim tugas", description: res.error, variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" /> Beri Tugas ke Karyawan
        </CardTitle>
        <CardDescription>Sebagai pengganti WA pribadi — semua tugas tercatat dan Anda bisa pantau siapa yang belum selesai.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          tabs={[
            { value: "new", label: "Tugas Baru" },
            { value: "given", label: `Yang Saya Berikan (${given.length})` },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "new" && (
          <form id="directive-form" onSubmit={onSubmit} className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label>Judul Tugas</Label>
              <Input name="title" required placeholder="mis. Kirim laporan progres minggu ini" />
            </div>
            <div className="space-y-1">
              <Label>Keterangan (opsional)</Label>
              <Textarea name="description" rows={2} placeholder="Detail tambahan..." />
            </div>
            <div className="space-y-1">
              <Label>Jatuh Tempo (opsional)</Label>
              <Input name="dueDate" type="date" />
            </div>

            <div className="space-y-1.5">
              <Label>Kirim ke</Label>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="targetType" checked={targetType === "ALL"} onChange={() => setTargetType("ALL")} />
                  Semua User
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="targetType" checked={targetType === "ROLE"} onChange={() => setTargetType("ROLE")} />
                  Per Role
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="targetType" checked={targetType === "USER"} onChange={() => setTargetType("USER")} />
                  1 Orang
                </label>
              </div>
              {targetType === "ROLE" && (
                <Select name="role" defaultValue="SALES" className="mt-1 max-w-xs">
                  <option value="SALES">Sales</option>
                  <option value="FINANCE">Finance</option>
                  <option value="PROJECT_MANAGER">Project Manager</option>
                </Select>
              )}
              {targetType === "USER" && (
                <Select name="userId" required className="mt-1 max-w-xs">
                  <option value="">Pilih user...</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({ROLE_LABEL[u.role] ?? u.role})
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <Button type="submit" disabled={pending} className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> {pending ? "Mengirim..." : "Kirim Tugas"}
            </Button>
          </form>
        )}

        {tab === "given" && (
          <div className="space-y-2.5 pt-1">
            {given.length === 0 && (
              <EmptyState title="Belum ada tugas yang diberikan" description="Tugas yang Anda berikan akan muncul di sini, lengkap dengan status penyelesaian tiap orang." />
            )}
            {given.map((b) => {
              const doneCount = b.recipients.filter((r) => r.status === "DONE").length;
              return (
                <div key={b.batchId} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{b.title}</p>
                      {b.description && <p className="text-xs text-muted-foreground whitespace-pre-line">{b.description}</p>}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDate(b.createdAt)}
                        {b.dueDate && <> &middot; jatuh tempo {formatDate(b.dueDate)}</>}
                      </p>
                    </div>
                    <Badge variant={doneCount === b.recipients.length ? "success" : "outline"} className="shrink-0">
                      {doneCount}/{b.recipients.length} selesai
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {b.recipients.map((r, i) => (
                      <span
                        key={i}
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          r.status === "DONE" ? "border-success/30 bg-success/10 text-success" : "border-border text-muted-foreground"
                        }`}
                      >
                        {r.name} {r.status === "DONE" ? "✓" : ""}
                      </span>
                    ))}
                  </div>
                  {b.recipients.some((r) => r.response) && (
                    <div className="mt-2 space-y-1 border-t border-border pt-2">
                      {b.recipients
                        .filter((r) => r.response)
                        .map((r, i) => (
                          <p key={i} className="text-xs">
                            <span className="font-medium">{r.name}:</span>{" "}
                            <span className="text-muted-foreground">{r.response}</span>
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
