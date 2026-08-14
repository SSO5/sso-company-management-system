import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Claude client for the app's document-extraction features (see
 * extract-purchase-order.ts, extract-progress-report.ts).
 *
 * Deliberately separate from any future "chat with the app" assistant
 * feature — this one thing (read a document, propose structured fields) is
 * the whole job. It never writes to the database itself; every caller takes
 * the suggestion and shows it to a human to confirm before anything is
 * saved (spec: AI drafts, people decide — see founder's own operating
 * principles).
 */
let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY belum diset. Tambahkan di .env (dan di Vercel Project Settings > Environment Variables) untuk mengaktifkan fitur ekstraksi AI."
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export function extractionModel(): string {
  return process.env.ANTHROPIC_EXTRACTION_MODEL || "claude-haiku-4-5-20251001";
}

/** Only PDF and common image types can be sent to Claude as a document/image block. */
export function isExtractableMimeType(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

/**
 * Builds the one content block Claude needs to "see" the file — a `document`
 * block for PDFs, an `image` block for photos of a document (field teams
 * sometimes photograph a paper PO/report instead of scanning it).
 */
export function fileContentBlock(buffer: Buffer, mimeType: string) {
  const data = buffer.toString("base64");
  if (mimeType === "application/pdf") {
    return { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } };
  }
  const media_type = (mimeType === "image/jpg" ? "image/jpeg" : mimeType) as
    | "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  return { type: "image" as const, source: { type: "base64" as const, media_type, data } };
}

/** Pulls the JSON object out of a Claude text reply, tolerant of stray prose/markdown fences around it. */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI tidak mengembalikan JSON yang bisa dibaca.");
  return JSON.parse(match[0]);
}
