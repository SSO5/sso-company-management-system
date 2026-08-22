import "server-only";
import { getAnthropicClient, extractionModel, extractJsonObject } from "./client";

/**
 * Extracts an invoice request from one Telegram message. Deliberately
 * narrow, same philosophy as parse-revision-command.ts: the amount to bill
 * is ALWAYS a Rupiah figure the user states explicitly — never a percentage
 * the model would have to compute "X% of what?" against, which is exactly
 * the kind of ambiguity that produces a wrong invoice. dpPercent (if
 * mentioned) is carried through only as a label printed on the PDF
 * ("DP 30%") — it never scales the amount.
 */
export interface ParsedInvoiceCommand {
  projectNumber: string | null;
  amount: number | null;
  dpPercent: number | null;
  dueInDays: number | null;
}

const SYSTEM_PROMPT = `Kamu membaca satu pesan Telegram yang meminta pembuatan Invoice baru di PT Sarana Sinergi Optima (SSO), perusahaan EPC.

Tugasmu HANYA mengenali: (1) nomor project yang ditagih, (2) jumlah tagihan dalam Rupiah, (3) label DP% kalau disebutkan (opsional, HANYA untuk dicetak di PDF, bukan untuk dihitung), (4) jatuh tempo dalam berapa hari (opsional).

ATURAN PENTING: jumlah tagihan HARUS berupa angka Rupiah yang eksplisit disebutkan di pesan (mis. "Rp150.000.000", "150 juta"). JANGAN menghitung sendiri dari persentase — kalau pesan cuma bilang "DP 30%" tanpa angka Rupiah, amount = null (biarkan tidak terisi), JANGAN menebak dari total quotation atau angka lain manapun.

Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown fence, persis bentuk ini:
{"projectNumber": string atau null, "amount": number atau null, "dpPercent": number atau null, "dueInDays": number atau null}`;

export async function parseInvoiceCommand(text: string): Promise<ParsedInvoiceCommand> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: extractionModel(),
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
  });

  const textBlock = message.content.find((b): b is Extract<typeof b, { type: "text" }> => b.type === "text");
  if (!textBlock) throw new Error("AI tidak mengembalikan teks.");

  const parsed = extractJsonObject(textBlock.text) as {
    projectNumber?: unknown;
    amount?: unknown;
    dpPercent?: unknown;
    dueInDays?: unknown;
  };

  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  return {
    projectNumber: str(parsed.projectNumber),
    amount: num(parsed.amount),
    dpPercent: num(parsed.dpPercent),
    dueInDays: num(parsed.dueInDays),
  };
}
