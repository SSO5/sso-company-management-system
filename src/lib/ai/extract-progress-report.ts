import "server-only";
import { getAnthropicClient, extractionModel, fileContentBlock, extractJsonObject } from "./client";

export interface ExtractedProgressItem {
  sectionName: string | null;
  partName: string;
  notes: string | null;
  isDone: boolean;
}

export interface ExtractedProgressReport {
  inspectionDate: string | null; // ISO yyyy-mm-dd
  location: string | null;
  overallPercent: number | null;
  summary: string | null;
  items: ExtractedProgressItem[];
  confidence: "high" | "low";
}

const SYSTEM_PROMPT = `Kamu membaca laporan inspeksi/progres lapangan (inspection report / progress report) dari pekerjaan servis motor dan gearbox industri milik PT Sarana Sinergi Optima (SSO). Dokumen ini ditulis oleh tim lapangan SSO sendiri, jadi ekstrak isinya apa adanya — jangan mengarang item yang tidak disebutkan.

Ekstrak checklist per bagian/komponen yang diperiksa atau dikerjakan. Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown fence, persis bentuk ini:

{
  "inspectionDate": string atau null,   // tanggal laporan/kunjungan, format YYYY-MM-DD
  "location": string atau null,         // lokasi pengerjaan/inspeksi jika disebutkan
  "overallPercent": number atau null,   // persen progres keseluruhan pekerjaan JIKA disebutkan eksplisit di dokumen, else null
  "summary": string atau null,          // ringkasan 1-2 kalimat untuk management, bahasa Indonesia, netral (bukan menyimpulkan hal yang tidak tertulis)
  "confidence": "high" atau "low",
  "items": [
    {
      "sectionName": string atau null,  // nama unit/bagian yang dikerjakan, contoh "MOTOR 45 KW 60 HP" atau "GEARBOX DRIVE UNIT 6804"
      "partName": string,               // item/komponen yang diperiksa atau dikerjakan, contoh "Bearing 6313 SKF ZZ C3"
      "notes": string atau null,        // keterangan tambahan persis dari dokumen (kondisi, tindakan, status pengadaan spare part, dll)
      "isDone": boolean                 // true HANYA jika dokumen secara eksplisit menyatakan item ini sudah selesai/OK/terpasang; false jika masih berjalan/menunggu/belum, atau tidak disebutkan statusnya
    }
  ]
}

Satu baris "Description"/"Bagian yang dicek" di tabel laporan = satu item. Jika dokumen tidak berbentuk tabel checklist (misal laporan naratif), pecah tetap jadi item per komponen/tindakan yang disebutkan. Jika benar-benar tidak ada rincian per item, kembalikan items: [].`;

export async function extractProgressReport(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractedProgressReport> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: extractionModel(),
    max_tokens: 4096,
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

  const parsed = extractJsonObject(textBlock.text) as Partial<ExtractedProgressReport>;
  const items = Array.isArray(parsed.items)
    ? parsed.items
        .filter((i): i is ExtractedProgressItem => Boolean(i) && typeof i === "object" && typeof (i as ExtractedProgressItem).partName === "string")
        .map((i) => ({
          sectionName: typeof i.sectionName === "string" && i.sectionName.trim() ? i.sectionName.trim() : null,
          partName: i.partName.trim(),
          notes: typeof i.notes === "string" && i.notes.trim() ? i.notes.trim() : null,
          isDone: Boolean(i.isDone),
        }))
    : [];

  return {
    inspectionDate: typeof parsed.inspectionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.inspectionDate) ? parsed.inspectionDate : null,
    location: typeof parsed.location === "string" && parsed.location.trim() ? parsed.location.trim() : null,
    overallPercent:
      typeof parsed.overallPercent === "number" && parsed.overallPercent >= 0 && parsed.overallPercent <= 100
        ? Math.round(parsed.overallPercent)
        : null,
    summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : null,
    confidence: parsed.confidence === "low" ? "low" : "high",
    items,
  };
}
