"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Paperclip, FileText, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  sendAssistantMessage,
  confirmAssistantAction,
  cancelAssistantAction,
} from "@/server/assistant";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface PendingAction {
  id: string;
  description: string;
  resolved?: "confirmed" | "cancelled";
  resultText?: string;
  fileUrl?: string;
}

/** AISSO can embed a "\n[PDF_URL]<path>" suffix on a confirm result to hand
 * back a file the user can open right in the chat â€” split it off so the
 * URL renders as a real button instead of raw text in the bubble. */
function splitFileUrl(message: string): { text: string; fileUrl?: string } {
  const match = message.match(/\n\[PDF_URL\](\S+)$/);
  if (!match) return { text: message };
  return { text: message.slice(0, match.index), fileUrl: match[1] };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  pendingAction?: PendingAction;
}

/**
 * "AISSO" â€” the floating "chat with the app" assistant, available on every
 * authenticated page (mounted once in the (app) layout). Conversation
 * history lives only
 * in this component's state â€” nothing is persisted server-side, so a page
 * refresh starts a fresh conversation. See src/server/assistant.ts for the
 * tool-use loop and src/lib/ai/assistant-tools.ts for the closed tool
 * vocabulary this can act on.
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type)) {
      toast({
        title: "Tipe file tidak didukung",
        description: "Lampirkan PDF atau foto (JPG/PNG/WEBP).",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({
        title: "File terlalu besar",
        description: "Maksimal 15MB.",
        variant: "destructive",
      });
      return;
    }
    setAttachedFile(file);
  }

  async function onSend() {
    const text = input.trim();
    if ((!text && !attachedFile) || sending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const fileForSend = attachedFile;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text || `ðŸ“Ž ${fileForSend?.name}` },
    ]);
    setInput("");
    setAttachedFile(null);
    setSending(true);
    const attachment = fileForSend
      ? {
          dataBase64: await readFileAsBase64(fileForSend),
          mimeType: fileForSend.type,
          fileName: fileForSend.name,
        }
      : null;
    const res = await sendAssistantMessage(history, text, attachment);
    setSending(false);
    if (!res.ok) {
      toast({
        title: "AISSO gagal merespons",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: res.data.reply,
        pendingAction: res.data.pendingAction
          ? {
              id: res.data.pendingAction.id,
              description: res.data.pendingAction.description,
            }
          : undefined,
      },
    ]);
  }

  async function onConfirm(msgIndex: number, id: string) {
    const res = await confirmAssistantAction(id);
    const { text: resultText, fileUrl } = res.ok
      ? splitFileUrl(res.data.message)
      : { text: res.error, fileUrl: undefined };
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex && m.pendingAction
          ? {
              ...m,
              pendingAction: {
                ...m.pendingAction,
                resolved: "confirmed",
                resultText,
                fileUrl,
              },
            }
          : m,
      ),
    );
    if (res.ok) {
      toast({ title: resultText, variant: "success" });
      router.refresh();
    } else {
      toast({
        title: "Gagal menjalankan aksi",
        description: res.error,
        variant: "destructive",
      });
    }
  }

  async function onCancel(msgIndex: number, id: string) {
    await cancelAssistantAction(id);
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex && m.pendingAction
          ? {
              ...m,
              pendingAction: { ...m.pendingAction, resolved: "cancelled" },
            }
          : m,
      ),
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
        <>
          <button
            onClick={() => setOpen(true)}
            className="fixed bottom-4 right-4 z-40 flex min-h-11 items-center rounded-xl bg-primary px-4 py-3 text-white shadow-lg"
            aria-label="Tanya AISSO"
          >
            <span className="text-sm font-semibold">Asisten AI</span>
          </button>
        </>
      )}

      {open && (
        <div className="mood-card fixed bottom-24 right-5 z-40 flex h-[min(32rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/aisso-icon-v2.png"
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
            <p className="text-sm font-semibold">AISSO</p>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="mt-6 text-center">
                <p className="text-base font-bold text-primary">
                  Apa yang perlu Anda tinjau?
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Status quotation/project, daftar yang menunggu approval, atau
                  minta approve/reject (sesuai role Anda).
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {m.content}
                  {m.pendingAction && (
                    <div className="mt-2 rounded-md border border-border bg-card p-2 text-xs text-foreground">
                      <p className="font-medium">
                        {m.pendingAction.description}
                      </p>
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
                        <>
                          <p className="mt-1 text-muted-foreground">
                            {m.pendingAction.resolved === "confirmed"
                              ? (m.pendingAction.resultText ?? "Selesai.")
                              : "Dibatalkan."}
                          </p>
                          {m.pendingAction.resolved === "confirmed" &&
                            m.pendingAction.fileUrl && (
                              <a
                                href={m.pendingAction.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <button className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90">
                                  <FileDown className="h-3.5 w-3.5" /> Lihat PDF
                                </button>
                              </a>
                            )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <p className="text-xs text-muted-foreground">
                AISSO sedang mengetik...
              </p>
            )}
          </div>

          <div className="border-t border-border p-3">
            {attachedFile && (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1 text-xs">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{attachedFile.name}</span>
                <button
                  onClick={() => setAttachedFile(null)}
                  aria-label="Hapus lampiran"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_ATTACHMENT_TYPES.join(",")}
                onChange={onPickFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-50"
                aria-label="Lampirkan file"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSend()}
                aria-label="Pesan untuk asisten"
                placeholder="Tanya status proyek atau dokumen…"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                disabled={sending}
              />
              <button
                onClick={onSend}
                disabled={sending || (!input.trim() && !attachedFile)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                aria-label="Kirim"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
