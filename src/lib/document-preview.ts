import JSZip from "jszip";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { Readable } from "node:stream";
const LIMIT = 24 * 1024 * 1024;
export function nativePreview(mime: string) {
  if (mime === "application/pdf") return "pdf";
  if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime))
    return "image";
  if (["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav"].includes(mime))
    return "audio";
  if (["video/mp4", "video/webm"].includes(mime)) return "video";
  return null;
}
export async function readOfficePreview(buffer: Buffer, name: string) {
  if (buffer.length > 12 * 1024 * 1024)
    throw new Error("File terlalu besar untuk pratinjau isi. Unduh file asli.");
  const ext = name.split(".").pop()?.toLowerCase();
  const note =
    "Pratinjau isi, bukan salinan tata letak. Rumus tidak dihitung ulang. Gunakan file asli untuk pemeriksaan akhir.";
  if (["txt", "md", "log", "json"].includes(ext || ""))
    return {
      kind: "text",
      text: buffer.toString("utf8").slice(0, 150000),
      note: "Ditampilkan sebagai teks biasa, maksimal 150.000 karakter.",
    };
  if (ext === "csv" || ext === "tsv") {
    const result = Papa.parse<string[]>(buffer.toString("utf8"), {
      preview: 101,
      delimiter: ext === "tsv" ? "\t" : "",
      skipEmptyLines: true,
    });
    return {
      kind: "sheets",
      sheets: [
        { name, rows: result.data.slice(0, 100).map((r) => r.slice(0, 30)) },
      ],
      note: "Pratinjau maksimal 100 baris dan 30 kolom.",
    };
  }
  if (!["xlsx", "docx", "pptx"].includes(ext || ""))
    return {
      kind: "unsupported",
      note: "Format ini belum mendukung pratinjau. PDF, gambar, XLSX, CSV, DOCX, PPTX, teks, serta audio/video umum dapat ditampilkan.",
    };
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files).filter((f) => !f.dir);
  if (files.length > 1500)
    throw new Error("Dokumen terlalu kompleks untuk pratinjau.");
  let total = 0;
  // Bound expanded content before Office parsers read an untrusted archive.
  for (const file of files)
    await new Promise<void>((resolve, reject) => {
      const stream = file.nodeStream("nodebuffer") as Readable;
      stream.on("data", (chunk) => {
        total += chunk.length;
        if (total > LIMIT) {
          stream.destroy();
          reject(new Error("Isi dokumen terlalu besar untuk pratinjau."));
        }
      });
      stream.on("end", resolve);
      stream.on("error", reject);
    });
  if (ext === "xlsx") {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    return {
      kind: "sheets",
      sheets: book.worksheets.slice(0, 8).map((s) => ({
        name: s.name,
        rows: Array.from({ length: Math.min(s.rowCount, 100) }, (_, r) =>
          Array.from({ length: Math.min(s.columnCount, 30) }, (_, c) => {
              const cell = s.getCell(r + 1, c + 1);
              if (cell.value === null || cell.value === undefined) return "";
            return cell.type === ExcelJS.ValueType.Formula &&
              cell.result === undefined
              ? `=${cell.formula} (hasil belum tersimpan)`
              : cell.text.slice(0, 4000);
          }),
        ),
      })),
      note: `${note} Maksimal 8 lembar, 100 baris, dan 30 kolom per lembar.`,
    };
  }
  const names =
    ext === "docx"
      ? ["word/document.xml"]
      : files
          .map((f) => f.name)
          .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .slice(0, 40);
  const texts: string[] = [];
  for (const path of names) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) continue;
    const paragraphs = xml
      .split(ext === "docx" ? /<\/w:p>/ : /<\/a:p>/)
      .map((p) =>
        [...p.matchAll(/<(?:w|a):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|a):t>/g)]
          .map((m) => m[1])
          .join(""),
      )
      .filter(Boolean);
    texts.push(paragraphs.join("\n"));
  }
  const text = texts
    .join("\n\n────────\n\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .slice(0, 150000);
  return {
    kind: "text",
    text:
      text ||
      "Tidak ada teks yang dapat ditampilkan. Gunakan file asli untuk gambar dan tata letaknya.",
    note: "Pratinjau teks dokumen. Gambar, tanda tangan, dan tata letak lengkap tersedia dalam file asli.",
  };
}
