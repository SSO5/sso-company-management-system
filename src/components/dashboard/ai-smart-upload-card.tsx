"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { classifyUploadWithAI, confirmSmartUpload } from "@/server/documents/smart-upload";
import { DOCUMENT_FOLDER_OPTIONS } from "@/lib/document-folder-options";
import type { DocumentClassification, CandidateProject } from "@/lib/ai/classify-document";
import { Sparkles, Upload, TriangleAlert } from "lucide-react";

type Step = "upload" | "confirm";

/**
 * "Upload apapun, AI yang tentukan foldernya" (founder request, Aug 2026).
 * The file is read once in step 1 and kept in React state (not staged
 * server-side — there's nothing safe to persist until a folder is chosen),
 * then re-submitted as a fresh FormData on confirm. Same "AI drafts, human
 * decides" two-step shape as PoExtractUploadDialog, generalized to any
 * document type instead of just customer POs.
 */
export function AiSmartUploadCard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extracted, setExtracted] = useState<DocumentClassification | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [projects, setProjects] = useState<CandidateProject[]>([]);
  const router = useRouter();
  const { toast } = useToast();

  function reset() {
    setStep("upload");
    setFile(null);
    setExtracted(null);
    setExtractionError(null);
    setProjects([]);
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const picked = fd.get("file") as File | null;
    if (!picked || picked.size === 0) {
      toast({ title: "Pilih file terlebih dahulu", variant: "destructive" });
      return;
    }
    setFile(picked);
    setPending(true);
    const res = await classifyUploadWithAI(fd);
    setPending(false);
    if (!res.ok) {
      toast({ title: "Gagal membaca file", description: res.error, variant: "destructive" });
      return;
    }
    setExtracted(res.data.extracted);
    setExtractionError(res.data.extractionError);
    setProjects(res.data.projects);
    setStep("confirm");
  }

  async function onConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData(e.currentTarget);
    const projectNumber = String(fd.get("projectNumber") || "");
    const routeKey = String(fd.get("routeKey") || "");
    const fileName = String(fd.get("fileName") || "");

    const uploadFd = new FormData();
    uploadFd.append("file", file);

    setPending(true);
    const res = await confirmSmartUpload({ projectNumber, routeKey, fileName }, uploadFd);
    setPending(false);
    if (res.ok) {
      toast({ title: "Dokumen tersimpan", description: res.data.folderPath, variant: "success" });
      setOpen(false);
      reset();
      router.refresh();
    } else {
      toast({ title: "Tidak bisa menyimpan", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Upload Dokumen (AI)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Upload file apapun — AI membaca isinya, menentukan project &amp; foldernya, lalu mengganti nama sesuai
            standar. Anda tetap memeriksa sebelum disimpan.
          </p>
          <Button onClick={() => setOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Upload
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
        title={step === "upload" ? "Upload Dokumen" : "Konfirmasi Tujuan Dokumen"}
        description={
          step === "upload"
            ? "PDF atau foto dokumen — AI akan membaca dan menyarankan project, folder, dan nama file. Tipe lain (Word/Excel) tetap bisa diupload, tapi Anda pilih tujuannya manual."
            : `Dari file "${file?.name}". Periksa/lengkapi sebelum disimpan sebagai dokumen resmi.`
        }
      >
        {step === "upload" && (
          <form onSubmit={onUpload} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="smart-upload-file">File</Label>
              <Input
                id="smart-upload-file"
                name="file"
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={pending}>
                <Sparkles className="h-3.5 w-3.5" /> {pending ? "Membaca dengan AI..." : "Analisa & Lanjut"}
              </Button>
            </div>
          </form>
        )}

        {step === "confirm" && (
          <form onSubmit={onConfirm} className="space-y-3">
            {extractionError && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{extractionError}</span>
              </div>
            )}
            {extracted?.confidence === "low" && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  AI kurang yakin dengan klasifikasi ini{extracted.notes ? ` — ${extracted.notes}` : ""}. Periksa ulang
                  project &amp; foldernya.
                </span>
              </div>
            )}
            {extracted?.documentType && (
              <p className="text-xs text-muted-foreground">
                AI mendeteksi jenis dokumen: <span className="font-medium text-foreground">{extracted.documentType}</span>
              </p>
            )}

            <div className="space-y-1">
              <Label htmlFor="su-project">Project</Label>
              <Select id="su-project" name="projectNumber" required defaultValue={extracted?.projectNumber ?? ""}>
                <option value="" disabled>Pilih project</option>
                {projects.map((p) => (
                  <option key={p.number} value={p.number}>
                    {p.number} — {p.customerName}
                    {p.jobNumber ? ` (${p.jobNumber})` : ""}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="su-folder">Folder Tujuan</Label>
              <Select id="su-folder" name="routeKey" required defaultValue={extracted?.routeKey ?? ""}>
                <option value="" disabled>Pilih folder</option>
                {DOCUMENT_FOLDER_OPTIONS.map((f) => (
                  <option key={f.routeKey} value={f.routeKey}>{f.label}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="su-filename">Nama File</Label>
              <Input
                id="su-filename"
                name="fileName"
                required
                defaultValue={extracted?.suggestedFileName ?? file?.name.replace(/\.[^.]+$/, "") ?? ""}
              />
              <p className="text-[11px] text-muted-foreground">
                Ekstensi asli (.{file?.name.split(".").pop()}) ditambahkan otomatis. Standar penamaan: TANGGAL - Jenis
                Dokumen - Deskripsi Singkat.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep("upload")}>
                Kembali
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Menyimpan..." : "Simpan Dokumen"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
