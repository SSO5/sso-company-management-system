"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Image as ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatFileSize,
  isPreviewableImage,
  RECEIPT_ACCEPT,
  RECEIPT_FILE_MESSAGE,
  receiptFileProblem,
} from "@/lib/expense-capture";
import { cn } from "@/lib/utils";

/**
 * Area unggah struk beserta pratinjaunya.
 *
 * Tiga hal yang membuatnya bukan sekadar <input type="file">:
 *
 *   1. TOMBOL KAMERA TERPISAH. Struk difoto di lapangan, bukan dipilih dari
 *      folder. `capture="environment"` membuka kamera belakang langsung di
 *      ponsel, dan itu menghemat tiga ketukan pada satu-satunya perangkat
 *      yang benar-benar dipakai untuk ini.
 *   2. PRATINJAU SEBELUM DIKIRIM. Foto struk sering buram atau terpotong,
 *      dan itu baru ketahuan setelah pembacaan gagal. Menampilkannya besar
 *      lebih dulu membuat orang mengulang foto sebelum menunggu unggahan.
 *   3. PENOLAKAN DI BROWSER. Berkas yang terlalu besar atau salah jenis
 *      ditolak sebelum naik. Membiarkan orang menunggu unggahan 30MB lalu
 *      gagal di server adalah cara pasti membuat fitur ini ditinggalkan.
 *
 * HEIC boleh diunggah tapi tidak bisa dipratinjau — tidak ada browser yang
 * merendernya tanpa konversi — dan itu dikatakan, bukan disembunyikan
 * sebagai gambar rusak.
 */
export function ReceiptUploadArea({
  onFileChange,
  pending = false,
}: {
  onFileChange?: (file: File | null) => void;
  pending?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // URL objek wajib dilepas, kalau tidak berkasnya tertahan di memori
  // selama tab terbuka — dan orang bisa memotret belasan struk beruntun.
  useEffect(() => {
    if (!file || !isPreviewableImage(file.name)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function terima(next: File | null) {
    if (!next) {
      setFile(null);
      setProblem(null);
      onFileChange?.(null);
      return;
    }
    const masalah = receiptFileProblem(next);
    if (masalah) {
      setProblem(RECEIPT_FILE_MESSAGE[masalah]);
      setFile(null);
      onFileChange?.(null);
      return;
    }
    setProblem(null);
    setFile(next);
    onFileChange?.(next);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          terima(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm">
          Tarik foto struk ke sini, atau pilih dari perangkat.
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Foto (JPG, PNG, WEBP, HEIC) atau PDF, maksimal 20MB.
        </p>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {/* Kamera didahulukan: struk difoto di lapangan, bukan dipilih
              dari folder. */}
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={pending}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="mr-1.5 h-3.5 w-3.5" /> Foto struk
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => pickRef.current?.click()}
          >
            <ImageIcon className="mr-1.5 h-3.5 w-3.5" /> Pilih berkas
          </Button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Ambil foto struk dengan kamera"
          onChange={(e) => terima(e.target.files?.[0] ?? null)}
        />
        <input
          ref={pickRef}
          type="file"
          name="file"
          accept={RECEIPT_ACCEPT}
          className="hidden"
          aria-label="Pilih berkas struk"
          onChange={(e) => terima(e.target.files?.[0] ?? null)}
        />
      </div>

      {problem && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {problem}
        </p>
      )}

      {file && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 break-all text-sm">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {file.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => terima(null)}
              aria-label="Hapus pilihan berkas"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {previewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={`Pratinjau ${file.name}`}
                className="max-h-80 w-full rounded-md border object-contain"
              />
              <p className="text-[11px] text-muted-foreground">
                Pastikan nominal dan nama tokonya terbaca jelas sebelum dikirim.
                Foto buram adalah penyebab pembacaan gagal yang paling sering.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {isPreviewableImage(file.name)
                ? "Pratinjau belum siap."
                : "Berkas ini tidak bisa dipratinjau di browser, tapi tetap bisa diunggah dan dibaca."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
