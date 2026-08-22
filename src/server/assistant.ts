"use server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { getAnthropicClient, assistantModel } from "@/lib/ai/client";
import { ASSISTANT_TOOLS, WRITE_TOOLS, executeAssistantTool, runConfirmedAssistantAction } from "@/lib/ai/assistant-tools";
import type Anthropic from "@anthropic-ai/sdk";

const PENDING_TTL_MINUTES = 10;
const MAX_TOOL_ITERATIONS = 4;

const SYSTEM_PROMPT = `Nama kamu AISSO — asisten AI di dalam aplikasi "SSO Connect" milik PT Sarana Sinergi Optima (perusahaan EPC). Kamu membantu user yang sedang login menjawab pertanyaan seputar data perusahaan (quotation, project, approval) dan bisa menjalankan aksi terbatas lewat tools yang tersedia.

Aturan:
- Jawab dalam Bahasa Indonesia, singkat dan langsung ke inti.
- Kalau user bertanya siapa kamu, jawab bahwa kamu AISSO.
- HANYA gunakan tools yang tersedia untuk data/aksi — jangan pernah mengarang angka atau status yang tidak berasal dari hasil tool.
- Aksi yang mengubah data (approve/reject) TIDAK langsung tereksekusi walau kamu memanggil tool-nya — sistem akan menunggu konfirmasi eksplisit dari user dulu. Setelah memanggil tool aksi tersebut, sampaikan ke user secara jelas apa yang akan terjadi dan bahwa mereka perlu klik tombol konfirmasi di chat.
- Kalau user memakai role yang tidak berwenang, tool akan otomatis menolak dengan pesan error — sampaikan error itu apa adanya ke user, jangan disamarkan.`;

interface AssistantMessage { role: "user" | "assistant"; content: string }

export interface AssistantReply {
  reply: string;
  pendingAction?: { id: string; description: string };
}

export async function sendAssistantMessage(history: AssistantMessage[], message: string): Promise<ActionResult<AssistantReply>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const client = getAnthropicClient();

    const messages: Anthropic.MessageParam[] = [
      ...history.map((h): Anthropic.MessageParam => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    let pendingAction: { id: string; description: string } | undefined;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: assistantModel(),
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: ASSISTANT_TOOLS,
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
        return { reply: textBlock?.text ?? "(tidak ada balasan)", pendingAction };
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const execResult = await executeAssistantTool(block.name, block.input as Record<string, unknown>, actor).catch((err) => ({
          resultText: err instanceof Error ? `Error: ${err.message}` : "Terjadi kesalahan tak terduga.",
        }));

        if ("pendingAction" in execResult && execResult.pendingAction && WRITE_TOOLS.has(block.name)) {
          await prisma.assistantPendingAction.deleteMany({ where: { userId: actor.userId } });
          const row = await prisma.assistantPendingAction.create({
            data: {
              userId: actor.userId,
              toolName: execResult.pendingAction.toolName,
              argsJson: execResult.pendingAction.args as Prisma.InputJsonValue,
              description: execResult.pendingAction.description,
              expiresAt: new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000),
            },
          });
          pendingAction = { id: row.id, description: execResult.pendingAction.description };
        }

        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: execResult.resultText });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return { reply: "Maaf, permintaan ini terlalu kompleks untuk diproses sekaligus — coba pecah jadi beberapa pertanyaan.", pendingAction };
  });
}

export async function confirmAssistantAction(id: string): Promise<ActionResult<{ message: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const pending = await prisma.assistantPendingAction.findFirst({
      where: { id, userId: actor.userId, expiresAt: { gt: new Date() } },
    });
    if (!pending) throw new Error("Aksi ini sudah kedaluwarsa atau tidak ditemukan — minta AI ulangi permintaannya.");
    await prisma.assistantPendingAction.deleteMany({ where: { userId: actor.userId } });
    const message = await runConfirmedAssistantAction(pending.toolName, pending.argsJson as Record<string, unknown>, actor);
    return { message };
  });
}

export async function cancelAssistantAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await prisma.assistantPendingAction.deleteMany({ where: { id, userId: actor.userId } });
  });
}
