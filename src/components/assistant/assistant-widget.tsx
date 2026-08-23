"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { sendAssistantMessage, confirmAssistantAction, cancelAssistantAction } from "@/server/assistant";

interface PendingAction {
  id: string;
  description: string;
  resolved?: "confirmed" | "cancelled";
  resultText?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  pendingAction?: PendingAction;
}

/**
 * "AISSO" — the floating "chat with the app" assistant, available on every
 * authenticated page (mounted once in the (app) layout). Conversation
 * history lives only
 * in this component's state — nothing is persisted server-side, so a page
 * refresh starts a fresh conversation. See src/server/assistant.ts for the
 * tool-use loop and src/lib/ai/assistant-tools.ts for the closed tool
 * vocabulary this can act on.
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function onSend() {
    const text = input.trim();
    if (!text || sending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    const res = await sendAssistantMessage(history, text);
    setSending(false);
    if (!res.ok) {
      toast({ title: "AISSO gagal merespons", description: res.error, variant: "destructive" });
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: res.data.reply,
        pendingAction: res.data.pendingAction ? { id: res.data.pendingAction.id, description: res.data.pendingAction.description } : undefined,
      },
    ]);
  }

  async function onConfirm(msgIndex: number, id: string) {
    const res = await confirmAssistantAction(id);
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex && m.pendingAction
          ? { ...m, pendingAction: { ...m.pendingAction, resolved: "confirmed", resultText: res.ok ? res.data.message : res.error } }
          : m
      )
    );
    if (res.ok) {
      toast({ title: res.data.message, variant: "success" });
      router.refresh();
    } else {
      toast({ title: "Gagal menjalankan aksi", description: res.error, variant: "destructive" });
    }
  }

  async function onCancel(msgIndex: number, id: string) {
    await cancelAssistantAction(id);
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex && m.pendingAction ? { ...m, pendingAction: { ...m.pendingAction, resolved: "cancelled" } } : m))
    );
  }

  return (
    <>
      {open ? (
        <button
          onClick={() => setOpen(false)}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
          aria-label="Tutup AISSO"
        >
          <X className="h-6 w-6" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 w-24 overflow-hidden rounded-2xl shadow-xl ring-2 ring-white/50 transition-transform hover:scale-105 sm:w-28"
          aria-label="Tanya AISSO"
        >
          <span className="relative block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/aisso-halfbody.png" alt="AISSO" className="block w-full" />
            <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-center text-xs font-bold text-white">AISSO</span>
          </span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[32rem] w-96 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/aisso-icon.png" alt="" className="h-7 w-7 rounded-full object-cover" />
            <p className="text-sm font-semibold">AISSO</p>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="mt-6 text-center">
                <p className="text-base font-bold text-primary">Tanya apa aja, aku jawab!</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Status quotation/project, daftar yang menunggu approval, atau minta approve/reject (sesuai role
                  Anda).
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  )}
                >
                  {m.content}
                  {m.pendingAction && (
                    <div className="mt-2 rounded-md border border-border bg-card p-2 text-xs text-foreground">
                      <p className="font-medium">{m.pendingAction.description}</p>
                      {!m.pendingAction.resolved ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => onConfirm(i, m.pendingAction!.id)}
                            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                          >
                            Konfirmasi
                          </button>
                          <button
                            onClick={() => onCancel(i, m.pendingAction!.id)}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1 text-muted-foreground">
                          {m.pendingAction.resolved === "confirmed" ? m.pendingAction.resultText ?? "Selesai." : "Dibatalkan."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && <p className="text-xs text-muted-foreground">AISSO sedang mengetik...</p>}
          </div>

          <div className="flex items-center gap-2 border-t border-border p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              placeholder="Tanya sesuatu..."
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              disabled={sending}
            />
            <button
              onClick={onSend}
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              aria-label="Kirim"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
