import "server-only";
import { getAnthropicClient, extractionModel, fileContentBlock, extractJsonObject } from "./client";
import { DOCUMENT_FOLDER_OPTIONS } from "@/lib/document-folder-options";

export interface DocumentClassification {
  projectNumber: string | null; // must exactly match one candidate project's `number`, or null
  routeKey: string | null; // must exactly match one DOCUMENT_FOLDER_OPTIONS routeKey, or null
  documentType: string | null; // short human label, e.g. "Progress Report", "PO Customer", "Invoice"
  suggestedFileName: string | null; // WITHOUT extension — server appends the original one back
  confidence: "high" | "low";
  notes: string | null;
}

export interface CandidateProject {
  number: string;
  name: string;
  jobNumber: string | null;
  customerName: string;
}

/**
 * "Upload apapun, AI yang tentukan foldernya" (founder request, Aug 2026) —
 * this is the dashboard-wide sibling of extract-purchase-order.ts /
 * extract-progress-report.ts: same shape (read the real file, propose
 * structured fields, a human confirms before anything is saved), but instead
 * of extracting a known document type's data, it's classifying an UNKNOWN
 * file into (which project, which folder, what should it be renamed to).
 *
 * Never guesses a project or folder it isn't reasonably sure of — null is
 * the correct answer when the document doesn't clearly say, and the confirm
 * step lets a human pick manually either way.
 */
const FILE_NAMING_STANDARD =
  `YYYY-MM-DD - <Jenis Dokumen> - <Deskripsi Singkat>` +
  ` (tanpa ekstensi file, itu ditambahkan otomatis oleh sistem)`;

function buildSystemPrompt(candidateProjects: CandidateProject[]): string {
  const projectList = candidateProjects
    .map((p) => `- number="${p.number}" | nama="${p.name}" | jobNumber="${p.jobNumber ?? "-"}" | customer="${p.customerName}"`)
    .join("\n");
  const folderList = DOCUMENT_FOLDER_OPTIONS.map((f) => `- routeKey="${f.routeKey}" (${f.label}): ${f.hint}`).join("\n");

  return `Kamu membantu PT Sarana Sinergi Optima (SSO), perusahaan EPC, mengklasifikasikan sebuah dokumen yang baru diupload: project mana pemiliknya, folder mana yang tepat, dan nama file standar untuk dokumen itu.

DAFTAR PROJECT AKTIF (cocokkan dengan nomor PO/customer/nama project yang disebut di dalam dokumen):
${projectList || "(tidak ada project tercatat)"}

DAFTAR FOLDER YANG VALID (pilih SATU routeKey persis seperti tertulis, atau null jika tidak yakin):
${folderList}

Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown fence, persis bentuk ini:
{
  "projectNumber": string atau null,   // HARUS persis salah satu "number" di atas, atau null jika dokumen tidak menyebut project mana pun / tidak yakin
  "routeKey": string atau null,        // HARUS persis salah satu routeKey di atas, atau null jika tidak yakin
  "documentType": string atau null,    // label singkat jenis dokumen, mis. "Progress Report", "PO Customer", "Invoice", "BAST"
  "suggestedFileName": string atau null, // format: "${FILE_NAMING_STANDARD}". Gunakan tanggal yang tertulis DI DALAM dokumen (tanggal PO, tanggal laporan, dsb) jika ada; kalau dokumen tidak mencantumkan tanggal, isi null pada field ini dan jelaskan di notes.
  "confidence": "high" atau "low",
  "notes": string atau null            // 1 kalimat: kenapa low confidence, atau catatan lain yang perlu diperiksa manusia
}

Jangan pernah mengarang project atau folder yang tidak benar-benar cocok — isi null dan biarkan manusia yang menentukan.`;
}

export async function classifyDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  candidateProjects: CandidateProject[]
): Promise<DocumentClassification> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: extractionModel(),
    max_tokens: 1024,
    system: buildSystemPrompt(candidateProjects),
    messages: [
      {
        role: "user",
        content: [
          fileContentBlock(buffer, mimeType),
          { type: "text", text: `Nama file asli: "${fileName}". Klasifikasikan sesuai instruksi di atas.` },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b): b is Extract<typeof b, { type: "text" }> => b.type === "text");
  if (!textBlock) throw new Error("AI tidak mengembalikan teks.");

  const parsed = extractJsonObject(textBlock.text) as Partial<DocumentClassification>;
  const validRouteKeys = new Set(DOCUMENT_FOLDER_OPTIONS.map((f) => f.routeKey));
  const validProjectNumbers = new Set(candidateProjects.map((p) => p.number));

  return {
    projectNumber:
      typeof parsed.projectNumber === "string" && validProjectNumbers.has(parsed.projectNumber) ? parsed.projectNumber : null,
    routeKey: typeof parsed.routeKey === "string" && validRouteKeys.has(parsed.routeKey) ? parsed.routeKey : null,
    documentType: typeof parsed.documentType === "string" && parsed.documentType.trim() ? parsed.documentType.trim() : null,
    suggestedFileName:
      typeof parsed.suggestedFileName === "string" && parsed.suggestedFileName.trim() ? parsed.suggestedFileName.trim() : null,
    confidence: parsed.confidence === "low" ? "low" : "high",
    notes: typeof parsed.notes === "string" ? parsed.notes : null,
  };
}
