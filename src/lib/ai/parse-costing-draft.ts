import "server-only";
import { getAnthropicClient, extractionModel, extractJsonObject } from "./client";

/**
 * Extracts whatever pieces of a new Costing Sheet a single Telegram message
 * mentions — customer name, project title, job number, operational cost,
 * and/or a list of line items. A costing sheet needs far more structured
 * data than a revision command, so this is deliberately partial: the caller
 * (telegram-costing-draft.ts) merges whatever comes back into a draft that
 * accumulates across several messages, and decides what's still missing.
 * Numbers are never invented — a field the message doesn't mention comes
 * back undefined, not guessed or defaulted here.
 */
export interface CostingDraftItemExtraction {
  name: string;
  quantity?: number;
  unit?: string;
  costUnitPrice?: number;
  supplierDiscountPercent?: number;
  marginPercent?: number;
}

export interface CostingDraftExtraction {
  customerName?: string;
  projectTitle?: string;
  jobNo?: string;
  operationalCost?: number;
  items: CostingDraftItemExtraction[];
}

const SYSTEM_PROMPT = `Kamu membaca satu pesan Telegram yang merupakan bagian dari percakapan untuk MEMBUAT Costing Sheet baru di PT Sarana Sinergi Optima (SSO), perusahaan EPC. Pesan bisa berisi sebagian info saja (nama pelanggan, judul project, nomor job, biaya operasional, dan/atau daftar item barang/jasa).

Tugasmu HANYA mengenali dan menyalin apa yang DISEBUTKAN EKSPLISIT di pesan — JANGAN menebak atau mengisi angka yang tidak disebutkan.

Untuk tiap item yang disebutkan, catat: name (nama barang/jasa — wajib), quantity, unit (satuan, mis. "pcs"/"lot"/"unit"), costUnitPrice (harga modal/beli per unit, dalam Rupiah), supplierDiscountPercent (diskon dari supplier, %), marginPercent (target margin dari harga jual, %). Kalau salah satu dari field itu tidak disebutkan untuk item tersebut, JANGAN diisi (biarkan kosong/undefined) — jangan menebak 0 atau angka lain.

Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown fence, persis bentuk ini:
{
  "customerName": string atau null,
  "projectTitle": string atau null,
  "jobNo": string atau null,
  "operationalCost": number atau null,
  "items": [ { "name": string, "quantity": number atau null, "unit": string atau null, "costUnitPrice": number atau null, "supplierDiscountPercent": number atau null, "marginPercent": number atau null }, ... ]
}
"items" boleh array kosong kalau pesan ini tidak menyebutkan item apa pun (mis. pesan cuma menjawab nama pelanggan).`;

export async function parseCostingDraftMessage(text: string): Promise<CostingDraftExtraction> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: extractionModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
  });

  const textBlock = message.content.find((b): b is Extract<typeof b, { type: "text" }> => b.type === "text");
  if (!textBlock) throw new Error("AI tidak mengembalikan teks.");

  const parsed = extractJsonObject(textBlock.text) as {
    customerName?: unknown;
    projectTitle?: unknown;
    jobNo?: unknown;
    operationalCost?: unknown;
    items?: unknown;
  };

  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

  const items: CostingDraftItemExtraction[] = Array.isArray(parsed.items)
    ? parsed.items
        .map((raw): CostingDraftItemExtraction | null => {
          if (typeof raw !== "object" || raw === null) return null;
          const r = raw as Record<string, unknown>;
          const name = str(r.name);
          if (!name) return null;
          return {
            name,
            quantity: num(r.quantity),
            unit: str(r.unit),
            costUnitPrice: num(r.costUnitPrice),
            supplierDiscountPercent: num(r.supplierDiscountPercent),
            marginPercent: num(r.marginPercent),
          };
        })
        .filter((i): i is CostingDraftItemExtraction => i !== null)
    : [];

  return {
    customerName: str(parsed.customerName),
    projectTitle: str(parsed.projectTitle),
    jobNo: str(parsed.jobNo),
    operationalCost: num(parsed.operationalCost),
    items,
  };
}
