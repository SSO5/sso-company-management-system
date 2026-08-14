import "server-only";
import { getAnthropicClient, extractionModel, fileContentBlock, extractJsonObject } from "./client";

export interface ExtractedPurchaseOrder {
  number: string | null;
  poDate: string | null; // ISO yyyy-mm-dd
  poValue: number | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  confidence: "high" | "low";
  notes: string | null;
}

const SYSTEM_PROMPT = `Kamu membaca dokumen Purchase Order (PO) asli yang dikirim customer ke PT Sarana Sinergi Optima (SSO), perusahaan EPC/jasa perbaikan motor dan gearbox industri di Indonesia. Dokumen ini BUKAN dibuat oleh SSO — jangan pernah mengarang atau menebak nilai yang tidak benar-benar tertulis di dokumen.

Ekstrak field berikut dan balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown fence, persis bentuk ini:

{
  "number": string atau null,        // nomor PO/Order No dari customer, apa adanya, contoh "EPC-L/2026-0450"
  "poDate": string atau null,        // tanggal PO/Dated, format YYYY-MM-DD
  "poValue": number atau null,       // nilai TOTAL/Grand Total/Total Amount PO (setelah PPN jika ada), angka murni tanpa titik/koma/mata uang
  "paymentTerms": string atau null,  // Term of Payment persis seperti tertulis, contoh "40% DP, 50% Before Delivered, 10% Retention"
  "deliveryTerms": string atau null, // Term of Delivery persis seperti tertulis
  "confidence": "high" atau "low",   // "low" jika dokumen buram, terpotong, atau kamu ragu terhadap salah satu angka di atas
  "notes": string atau null          // catatan singkat 1 kalimat jika ada hal yang perlu diperiksa manusia, misal "Halaman 2 terpotong, item tidak lengkap"
}

Jika sebuah field benar-benar tidak ada di dokumen, isi null — jangan mengira-ngira.`;

export async function extractPurchaseOrder(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractedPurchaseOrder> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: extractionModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          fileContentBlock(buffer, mimeType),
          { type: "text", text: `Nama file: "${fileName}". Ekstrak sesuai instruksi di atas.` },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b): b is Extract<typeof b, { type: "text" }> => b.type === "text");
  if (!textBlock) throw new Error("AI tidak mengembalikan teks.");

  const parsed = extractJsonObject(textBlock.text) as Partial<ExtractedPurchaseOrder>;
  return {
    number: typeof parsed.number === "string" && parsed.number.trim() ? parsed.number.trim() : null,
    poDate: typeof parsed.poDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.poDate) ? parsed.poDate : null,
    poValue: typeof parsed.poValue === "number" && parsed.poValue > 0 ? parsed.poValue : null,
    paymentTerms: typeof parsed.paymentTerms === "string" ? parsed.paymentTerms : null,
    deliveryTerms: typeof parsed.deliveryTerms === "string" ? parsed.deliveryTerms : null,
    confidence: parsed.confidence === "low" ? "low" : "high",
    notes: typeof parsed.notes === "string" ? parsed.notes : null,
  };
}
