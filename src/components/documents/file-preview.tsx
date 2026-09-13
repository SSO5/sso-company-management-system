"use client";
import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Maximize2, Minimize2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fileKind, fileKindLabel, TEXT_PREVIEW_MAX_BYTES } from "@/lib/file-kind";

/**
 * Menampilkan isi berkas LANGSUNG di halaman, tanpa pindah tab.
 *
 * Semuanya lewat /api/files/[id]?view=1 — satu-satunya pintu baca berkas,
 * yang memeriksa sesi dan status sampah di tiap permintaan. Tidak ada URL
 * publik sementara yang dibuat, jadi model keamanannya tidak berubah sama
 * sekali: berkas tetap tidak bisa dibaca siapa pun tanpa sesi yang sah.
 *
 * Batas yang jujur: Word, Excel, dan PowerPoint TIDAK bisa dirender browser.
 * Untuk itu ditampilkan kartu yang menyebutkan jenisnya dan dua jalan keluar,
 * bukan kotak kosong yang menggantung. Lihat catatan di bawah kartu tersebut
 * untuk kenapa ini bukan sekadar belum dikerjakan.
 */
export function FilePreview({
  documentId,
  filename,
  fileSize,
  className,
}: {
  documentId: string;
  filename: string;
  fileSize: number;
  className?: string;
}) {
  const kind = fileKind(filename);
  const src = `/api/files/${documentId}?view=1`;
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Ganti berkas = mulai bersih. Tanpa ini, satu berkas gagal muat akan
  // membuat berkas berikutnya ikut tampil sebagai gagal.
  useEffect(() => {
    setFailed(false);
  }, [documentId]);

  const frame = cn(
    "relative overflow-hidden rounded-md border border-border bg-muted",
    expanded ? "h-[70vh]" : "h-64",
    className
  );

  function ExpandButton() {
    return (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Perkecil" : "Perbesar"}
        aria-label={expanded ? "Perkecil pratinjau" : "Perbesar pratinjau"}
        className="absolute right-2 top-2 z-10 rounded-md bg-background/85 p-1.5 text-foreground shadow-sm backdrop-blur hover:bg-background"
      >
        {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
    );
  }

  if (failed) {
    return <Unsupported documentId={documentId} filename={filename} reason="gagal" className={className} />;
  }

  if (kind === "image") {
    return (
      <div className={frame}>
        <ExpandButton />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={filename}
          onError={() => setFailed(true)}
          className="h-full w-full bg-[#0b0d12] object-contain"
        />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div className={frame}>
        <ExpandButton />
        {/* Pembaca PDF bawaan browser. Route sudah mengirim
            Content-Disposition: inline untuk ?view=1, jadi tidak perlu
            pustaka tambahan — dan tidak ada 2 MB JavaScript yang ikut. */}
        <iframe src={src} title={filename} className="h-full w-full border-0 bg-white" />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className={frame}>
        <ExpandButton />
        {/* .mov bisa gagal kalau codec-nya bukan H.264 — onError menangkapnya
            dan menurunkan ke kartu unduh, bukan pemutar hitam yang diam. */}
        <video src={src} controls onError={() => setFailed(true)} className="h-full w-full bg-black object-contain" />
      </div>
    );
  }

  if (kind === "text") {
    return <TextPreview src={src} fileSize={fileSize} filename={filename} documentId={documentId} frameClass={frame} onExpand={<ExpandButton />} />;
  }

  return <Unsupported documentId={documentId} filename={filename} reason="format" className={className} />;
}

function TextPreview({
  src, fileSize, filename, documentId, frameClass, onExpand,
}: {
  src: string; fileSize: number; filename: string; documentId: string; frameClass: string; onExpand: React.ReactNode;
}) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const tooBig = fileSize > TEXT_PREVIEW_MAX_BYTES;

  useEffect(() => {
    if (tooBig) return;
    let alive = true;
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => { if (alive) setBody(t); })
      .catch(() => { if (alive) setError(true); });
    // Berkas yang sedang dimuat bisa keburu diganti oleh klik berikutnya —
    // flag ini mencegah hasil lama menimpa tampilan yang sudah berganti.
    return () => { alive = false; };
  }, [src, tooBig]);

  if (tooBig || error) {
    return <Unsupported documentId={documentId} filename={filename} reason={tooBig ? "besar" : "gagal"} />;
  }

  return (
    <div className={frameClass}>
      {onExpand}
      <pre className="h-full w-full overflow-auto bg-card p-3 text-[11px] leading-relaxed text-foreground">
        {body ?? "Memuat…"}
      </pre>
    </div>
  );
}

/**
 * Kartu untuk berkas yang memang tidak bisa ditampilkan browser. Menyebut
 * jenisnya dengan nama yang dikenal orang ("Word", "PowerPoint") dan memberi
 * dua jalan keluar, supaya tidak ada jalan buntu.
 */
function Unsupported({
  documentId, filename, reason, className,
}: {
  documentId: string; filename: string; reason: "format" | "besar" | "gagal"; className?: string;
}) {
  const label = fileKindLabel(filename);
  const text =
    reason === "besar" ? "Berkas terlalu besar untuk ditampilkan di sini"
    : reason === "gagal" ? "Isi berkas tidak bisa dibaca browser"
    : `Berkas ${label} belum bisa ditampilkan di halaman`;

  return (
    <div className={cn("flex h-64 flex-col items-center justify-center gap-3 rounded-md border border-border bg-muted px-4 text-center", className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10">
        {reason === "format" ? <FileText className="h-6 w-6 text-primary" /> : <AlertCircle className="h-6 w-6 text-primary" />}
      </div>
      <p className="text-xs text-muted-foreground">{text}</p>
      <div className="flex gap-2">
        <a href={`/api/files/${documentId}?view=1`} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5" /> Tab baru</Button>
        </a>
        <a href={`/api/files/${documentId}`}>
          <Button size="sm"><Download className="h-3.5 w-3.5" /> Unduh</Button>
        </a>
      </div>
    </div>
  );
}
