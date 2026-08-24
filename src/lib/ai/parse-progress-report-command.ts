import "server-only";
import { getAnthropicClient, extractionModel, extractJsonObject } from "./client";

/**
 * Extracts the target project number from one Telegram caption/message
 * requesting a Progress Report from an attached file. Deliberately the only
 * thing this parses — the file itself carries everything else (checklist,
 * photos), extracted separately by extractProgressReport once the project
 * is confirmed to exist.
 */
export interface ParsedProgressReportCommand {
  projectNumber: string | null;
}

const SYSTEM_PROMPT = `Kamu membaca satu pesan/caption Telegram yang meminta pembuatan Progress Report dari file yang dilampirkan, di PT Sarana Sinergi Optima (SSO), perusahaan EPC.

Tugasmu HANYA mengenali nomor project yang dimaksud dari teks tersebut — boleh sebagian/tidak lengkap (contoh format asli: "001/PRJ/OPS/VIII/2026", tapi user mungkin cuma menyebut sebagian seperti "0042" atau "PRJ-0042"). JANGAN mengarang nomor kalau memang tidak disebutkan sama sekali.

Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown fence, persis bentuk ini:
{"projectNumber": string atau null}`;

export async function parseProgressReportCommand(text: string): Promise<ParsedProgressReportCommand> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: extractionModel(),
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text || "(tidak ada teks)" }],
  });

  const textBlock = message.content.find((b): b is Extract<typeof b, { type: "text" }> => b.type === "text");
  if (!textBlock) throw new Error("AI tidak mengembalikan teks.");

  const parsed = extractJsonObject(textBlock.text) as { projectNumber?: unknown };
  return {
    projectNumber: typeof parsed.projectNumber === "string" && parsed.projectNumber.trim() ? parsed.projectNumber.trim() : null,
  };
}
