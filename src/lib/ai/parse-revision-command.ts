import "server-only";
import { getAnthropicClient, extractionModel, extractJsonObject } from "./client";

/**
 * Parses a free-text Telegram message into ONE of a small, closed set of
 * supported quotation-revision commands. Deliberately narrow — this touches
 * a real priced document, so anything the model isn't confident maps
 * cleanly onto one of these three shapes comes back as "unsupported" rather
 * than a guessed edit. The caller (telegram-automation.ts) still computes
 * the actual new numbers itself via calcCostingLine/calcCostingSummary —
 * this only extracts intent, never a number to trust blindly.
 */
export type RevisionAction =
  | { type: "percent_adjustment"; percent: number } // e.g. +10 = raise selling price 10%, -5 = 5% discount
  | { type: "operational_cost_delta"; amount: number } // added to (or subtracted from, if negative) operationalCost
  | { type: "item_quantity"; itemName: string; quantity: number }
  | { type: "unsupported"; reason: string };

export interface ParsedRevisionCommand {
  quotationNumber: string | null;
  action: RevisionAction;
}

const SYSTEM_PROMPT = `Kamu membaca satu pesan Telegram yang meminta revisi Quotation di PT Sarana Sinergi Optima (SSO), perusahaan EPC.

Tugasmu HANYA mengenali (1) nomor quotation yang dimaksud, dan (2) jenis perubahan yang diminta — TIDAK menghitung angka apa pun sendiri.

Jenis perubahan yang didukung — HANYA tiga ini, tidak ada yang lain:
1. percent_adjustment: menaikkan/menurunkan harga jual secara persentase seragam. "naikkan harga 10%" -> percent=10. "diskon 5%" atau "turunkan 5%" -> percent=-5.
2. operational_cost_delta: mengubah biaya operasional. "biaya operasional tambah 2 juta" -> amount=2000000. "biaya operasional kurangi 1 juta" -> amount=-1000000.
3. item_quantity: mengubah quantity SATU item tertentu (harus menyebut nama item). "qty item Bracket jadi 8" -> itemName="Bracket", quantity=8.

Kalau pesan tidak jelas menyebut nomor quotation, atau permintaannya tidak persis cocok salah satu dari tiga pola di atas (misalnya "buatkan lebih murah" tanpa angka jelas, atau minta ubah banyak hal sekaligus), balas dengan type "unsupported" dan jelaskan alasannya singkat di reason — JANGAN menebak angka.

Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown fence, persis salah satu bentuk ini:
{"quotationNumber": string atau null, "action": {"type": "percent_adjustment", "percent": number}}
{"quotationNumber": string atau null, "action": {"type": "operational_cost_delta", "amount": number}}
{"quotationNumber": string atau null, "action": {"type": "item_quantity", "itemName": string, "quantity": number}}
{"quotationNumber": string atau null, "action": {"type": "unsupported", "reason": string}}`;

export async function parseRevisionCommand(text: string): Promise<ParsedRevisionCommand> {
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
    quotationNumber?: unknown;
    action?: { type?: unknown; percent?: unknown; amount?: unknown; itemName?: unknown; quantity?: unknown; reason?: unknown };
  };

  const quotationNumber = typeof parsed.quotationNumber === "string" && parsed.quotationNumber.trim() ? parsed.quotationNumber.trim() : null;
  const a = parsed.action;

  let action: RevisionAction = { type: "unsupported", reason: "AI tidak bisa mengurai permintaan ini." };
  if (a?.type === "percent_adjustment" && typeof a.percent === "number" && Number.isFinite(a.percent)) {
    action = { type: "percent_adjustment", percent: a.percent };
  } else if (a?.type === "operational_cost_delta" && typeof a.amount === "number" && Number.isFinite(a.amount)) {
    action = { type: "operational_cost_delta", amount: a.amount };
  } else if (
    a?.type === "item_quantity" &&
    typeof a.itemName === "string" && a.itemName.trim() &&
    typeof a.quantity === "number" && a.quantity > 0
  ) {
    action = { type: "item_quantity", itemName: a.itemName.trim(), quantity: a.quantity };
  } else if (a?.type === "unsupported") {
    action = { type: "unsupported", reason: typeof a.reason === "string" && a.reason.trim() ? a.reason.trim() : "Permintaan tidak didukung." };
  }

  return { quotationNumber, action };
}
