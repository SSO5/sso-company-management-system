/**
 * Menentukan cara sebuah berkas ditampilkan di dalam aplikasi.
 *
 * Sengaja ditebak dari NAMA berkas, bukan dari mimeType: DocumentRow yang
 * dikirim ke panel dokumen tidak membawa mimeType, dan menambahkannya berarti
 * mengubah query di halaman server yang sudah jalan. Ekstensi sudah cukup —
 * daftar yang boleh diunggah dibatasi di assertFileAllowed(), jadi tidak ada
 * ekstensi liar yang masuk.
 */
export type FileKind = "image" | "pdf" | "video" | "text" | "office" | "archive" | "other";

const BY_EXT: Record<string, FileKind> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image", svg: "image",
  pdf: "pdf",
  mp4: "video", webm: "video", mov: "video",
  txt: "text", csv: "text", md: "text", log: "text",
  doc: "office", docx: "office", xls: "office", xlsx: "office", ppt: "office", pptx: "office",
  zip: "archive", rar: "archive", "7z": "archive",
};

/** Berapa besar berkas teks yang masih masuk akal ditarik utuh ke browser. */
export const TEXT_PREVIEW_MAX_BYTES = 200 * 1024;

export function fileKind(filename: string): FileKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return BY_EXT[ext] ?? "other";
}

export function fileExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() as string) : "";
}

/**
 * Nama yang dimengerti orang, untuk ditulis di kartu "belum bisa ditampilkan".
 * Menyebut "Word" lebih menolong daripada "docx".
 */
export function fileKindLabel(filename: string): string {
  const ext = fileExtension(filename);
  const names: Record<string, string> = {
    doc: "Word", docx: "Word",
    xls: "Excel", xlsx: "Excel",
    ppt: "PowerPoint", pptx: "PowerPoint",
    zip: "Arsip ZIP", rar: "Arsip RAR", "7z": "Arsip 7z",
  };
  return names[ext] ?? (ext ? ext.toUpperCase() : "Berkas");
}
