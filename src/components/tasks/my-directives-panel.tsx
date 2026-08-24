"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { completeDirectiveAction, respondToDirectiveAction } from "@/server/directives";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, CircleDashed, ListTodo, MessageSquareReply } from "lucide-react";

interface MyDirective {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  status: string;
  completedAt: Date | null;
  response: string | null;
  respondedAt: Date | null;
  assignedBy: { name: string };
}

export function MyDirectivesPanel({ directives, openId }: { directives: MyDirective[]; openId?: string }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [replyOpenId, setReplyOpenId] = useState<string | null>(openId ?? null);
  const [replyDraft, setReplyDraft] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Deep-linked from a WA/email/in-app notification (?open=<id>) — jump
  // straight to that task instead of leaving the person to scan the list.
  useEffect(() => {
    if (!openId) return;
    const target = directives.find((d) => d.id === openId);
    if (!target) return;
    if (target.status === "OPEN") setReplyOpenId(openId);
    const el = itemRefs.current[openId];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  function onComplete(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await completeDirectiveAction(id);
      setPendingId(null);
      if (res.ok) {
        toast({ title: "Tugas ditandai selesai", variant: "success" });
        router.refresh();
      } else {
        toast({ title: "Tidak bisa menandai selesai", description: res.error, variant: "destructive" });
      }
    });
  }

  function onSendReply(id: string) {
    if (!replyDraft.trim()) return;
    setPendingId(id);
    startTransition(async () => {
      const res = await respondToDirectiveAction(id, { response: replyDraft.trim() });
      setPendingId(null);
      if (res.ok) {
        toast({ title: "Balasan terkirim", variant: "success" });
        setReplyOpenId(null);
        setReplyDraft("");
        router.refresh();
      } else {
        toast({ title: "Tidak bisa mengirim balasan", description: res.error, variant: "destructive" });
      }
    });
  }

  const open = directives.filter((d) => d.status === "OPEN");
  const done = directives.filter((d) => d.status === "DONE");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ListTodo className="h-4 w-4" /> Tugas untuk Saya
        </CardTitle>
        {open.length > 0 && <Badge variant="default">{open.length} belum selesai</Badge>}
      </CardHeader>
      <CardContent className="space-y-2">
        {directives.length === 0 && (
          <EmptyState title="Belum ada tugas" description="Direktur belum memberikan tugas atau reminder untuk Anda." />
        )}

        {open.map((d) => (
          <div
            key={d.id}
            ref={(el) => {
              itemRefs.current[d.id] = el;
            }}
            className={`rounded-lg border px-3 py-2.5 ${
              d.id === openId ? "border-primary bg-primary/[0.08] ring-2 ring-primary/30" : "border-primary/25 bg-primary/[0.04]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.title}</p>
                  {d.description && <p className="text-xs text-muted-foreground whitespace-pre-line">{d.description}</p>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    dari {d.assignedBy.name}
                    {d.dueDate && <> &middot; jatuh tempo {formatDate(d.dueDate)}</>}
                  </p>
                  {d.response && (
                    <p className="mt-1.5 rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
                      Balasan Anda: {d.response}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setReplyOpenId(replyOpenId === d.id ? null : d.id);
                    setReplyDraft(d.response ?? "");
                  }}
                >
                  <MessageSquareReply className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pendingId === d.id} onClick={() => onComplete(d.id)}>
                  Tandai Selesai
                </Button>
              </div>
            </div>
            {replyOpenId === d.id && (
              <div className="mt-2 flex items-start gap-2 border-t border-primary/15 pt-2">
                <Textarea
                  rows={2}
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  placeholder="Tulis balasan, mis. kendala yang dialami..."
                  className="text-sm"
                />
                <Button size="sm" className="h-8 shrink-0 text-xs" disabled={pendingId === d.id || !replyDraft.trim()} onClick={() => onSendReply(d.id)}>
                  Kirim
                </Button>
              </div>
            )}
          </div>
        ))}

        {done.length > 0 && (
          <details className="pt-1" open={done.some((d) => d.id === openId)}>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              {done.length} tugas selesai
            </summary>
            <div className="mt-1.5 space-y-1.5">
              {done.map((d) => (
                <div
                  key={d.id}
                  ref={(el) => {
                    itemRefs.current[d.id] = el;
                  }}
                  className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                    d.id === openId ? "border-primary ring-2 ring-primary/30" : "border-border opacity-70"
                  }`}
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div className="min-w-0">
                    <p className="text-sm">{d.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      dari {d.assignedBy.name} &middot; selesai {formatDate(d.completedAt)}
                    </p>
                    {d.response && <p className="mt-1 text-xs text-muted-foreground">Balasan: {d.response}</p>}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
