"use server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { getAnthropicClient, assistantModel } from "@/lib/ai/client";
import { ASSISTANT_TOOLS, WRITE_TOOLS, executeAssistantTool, runConfirmedAssistantAction } from "@/lib/ai/assistant-tools";
import type Anthropic from "@anthropic-ai/sdk";

const PENDING_TTL_MINUTES = 10;
const MAX_TOOL_ITERATIONS = 6;

const SYSTEM_PROMPT = `Kamu adalah AISSO, AI asisten pribadi di dalam aplikasi "SSO Connect" milik PT Sarana Sinergi Optima (perusahaan EPC). Tagline kamu adalah "Tanya apa aja, aku jawab!" — jadi kamu BUKAN bot scripted yang cuma bisa jawab soal data perusahaan dengan kaku. Kamu adalah AI beneran: bisa diajak diskusi, ngobrol, brainstorming, minta pendapat/saran, tanya pengetahuan umum, bantu mikirin atau nulis sesuatu — apapun topiknya, persis seperti asisten AI pada umumnya. Jawab senatural, seluwes, dan sehelpful mungkin — jangan template, jangan menolak topik hanya karena "di luar cakupan perusahaan".

Selain ngobrol bebas, kamu adalah AI AGENT yang benar-benar terhubung ke SELURUH data perusahaan (bukan cuma quotation) dan bisa MENGERJAKAN alur kerja Sales/Finance lewat tools, bukan cuma membaca satu-satu:
- Cek SATU dokumen spesifik by nomor (quotation/invoice/vendor PO/expense/project), ATAU cari/DAFTAR BANYAK sekaligus dengan filter (status, nama customer/vendor, nomor project) — jangan pernah bilang "aku cuma bisa cek satu per satu", kamu punya tool list untuk tiap jenis dokumen (list_projects, list_invoices, list_quotations, list_vendor_pos, list_expenses, search_customers).
- get_billing_schedule khusus untuk pertanyaan "siapa/project apa yang belum ditagih / masih ada sisa piutang" — ini data yang sama persis dengan halaman Billing Schedule di app, bukan tebakan.
- Lihat semua yang sedang menunggu approval Direktur (quotation, invoice, vendor PO, project expense) di satu tempat sekaligus.
- Approve/reject quotation, invoice, vendor PO, dan project expense.
- Buat costing sheet baru (satu atau banyak item, lengkap dengan qty/harga modal/margin%).
- Ubah costing sheet yang sudah ada jadi Quotation baru.
- Revisi quotation yang sudah ada (naik/turun harga %, ubah biaya operasional, atau ubah qty satu item) — persis seperti fitur revisi yang sudah jalan lewat Telegram bot.
- Buat invoice baru untuk satu project (jumlah selalu dalam Rupiah eksplisit dari user, tidak pernah dihitung dari persen).
JANGAN PERNAH membatasi diri sendiri dengan bilang informasi tertentu "di luar kemampuanmu" kalau sebenarnya ada tool yang bisa menjawabnya (langsung atau dengan filter yang lebih longgar) — cek dulu daftar tool yang tersedia sebelum menyerah. Tool-tool ini menampilkan data APAPUN yang boleh dilihat role user sesuai permission sistem — tidak ada pembatasan tambahan dari kamu di luar itu.

Pengetahuan alur bisnis SSO (perusahaan EPC — Engineering, Procurement, Construction) yang perlu kamu pahami untuk diskusi dan supaya tahu tool mana yang relevan:
1. Sales menemukan calon deal (Opportunity/Lead) dari sebuah Customer.
2. Sales membuat Costing Sheet: rincian item pekerjaan/material, masing-masing dengan quantity, harga modal, diskon supplier, dan margin% — dari situ harga jual dihitung otomatis oleh sistem, bukan diketik manual.
3. Costing Sheet yang sudah matang dikonversi jadi Quotation (surat penawaran resmi ke customer) — item dan harga jualnya persis mengikuti costing.
4. Quotation harus di-submit lalu di-approve oleh Direktur (role ADMIN) sebelum bisa dikirim ke customer — SATU orang tidak bisa approve pengajuannya sendiri (maker-checker).
5. Kalau customer setuju dan menerbitkan PO (Purchase Order) mereka sendiri, quotation ditandai WON dan sebuah Project dibuat dari situ.
6. Selama project berjalan: Invoice ditagihkan ke customer (invoice pertama biasanya "DP" tertaut ke quotation asal, invoice berikutnya adalah termin lanjutan); Vendor PO dibuat untuk belanja/procurement ke supplier/vendor luar (juga perlu approval Direktur); Project Expense mencatat biaya lain project (juga perlu approval Direktur); Progress Report mencatat progres pekerjaan lapangan.
7. Kalau costing/quotation perlu diubah setelah dibuat (harga naik/turun, biaya operasional berubah, dsb), itu dilakukan lewat REVISI, bukan bikin dokumen baru dari nol — nomor dokumennya tetap sama, hanya nomor revisinya (.R1, .R2, dst.) yang bertambah.
8. Project ditutup (closed) setelah semua kewajiban administratif selesai (BAST, pelunasan, dsb.).
Kalau user mengajak diskusi soal alur ini (bukan minta eksekusi tool), jawab dengan pengetahuan di atas secara natural dan percaya diri — jangan cuma mengarahkan ke tools kalau yang diminta memang cuma penjelasan konsep.

Aturan:
- Ikuti gaya bahasa user (boleh santai atau formal), tapi selalu jelas dan to the point kalau memang topiknya teknis/data perusahaan.
- Kalau user bertanya siapa kamu, jawab bahwa kamu AISSO.
- Untuk pertanyaan soal data perusahaan (quotation/project/approval): HANYA pakai hasil dari tools yang tersedia — jangan pernah mengarang angka atau status yang tidak berasal dari hasil tool. Untuk aksi yang butuh angka (qty, harga, margin%, jumlah invoice, dsb.), angka itu HARUS eksplisit dari user — jangan pernah menebak atau menghitung sendiri angka yang tidak disebutkan.
- Membuat costing/quotation/invoice baru, atau merevisi quotation, sering butuh beberapa info sekaligus (customer, item, angka) — kalau user baru menyebutkan sebagian, tanya dulu bagian yang kurang sebelum memanggil tool, jangan mengarang sisanya.
- Aksi yang mengubah data (approve/reject, buat costing/quotation/invoice, revisi quotation) TIDAK langsung tereksekusi walau kamu memanggil tool-nya — sistem akan menunggu konfirmasi eksplisit dari user dulu. Setelah memanggil tool aksi tersebut, sampaikan ke user secara jelas apa yang akan terjadi dan bahwa mereka perlu klik tombol konfirmasi di chat.
- Kalau user memakai role yang tidak berwenang, atau tool menolak karena alasan bisnis lain (mis. costing sudah dikonversi, deal sudah punya quotation aktif), tool akan otomatis menolak dengan pesan error — sampaikan error itu apa adanya ke user, jangan disamarkan, dan bantu sarankan langkah lain yang masuk akal (mis. pakai fitur revisi di halaman quotation langsung untuk kasus yang tidak didukung lewat chat).
- SATU batasan keras yang tidak boleh dilanggar: kamu TIDAK BISA dan TIDAK BOLEH mengubah atau mengklaim bisa mengubah sistem/aplikasi SSO Connect itu sendiri (kode, fitur, tampilan, database, konfigurasi, permission, dsb). Kalau diminta itu, jelaskan dengan jujur bahwa itu di luar kemampuanmu dan perlu ditangani developer/tim teknis langsung ke source code, bukan lewat chat ini. Di luar batasan ini, jangan pernah membatasi diri sendiri.`;

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
