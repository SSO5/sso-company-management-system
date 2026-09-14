"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { uploadDocumentToFolder } from "@/server/documents/documents";
import { Upload } from "lucide-react";

export function UploadDialog({ folderId }: { folderId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await uploadDocumentToFolder(folderId, fd);
    setPending(false);
    if (res.ok) { toast({ title: "Dokumen berhasil diunggah", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Dokumen belum dapat diunggah", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Upload className="h-3.5 w-3.5" /> Unggah</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Unggah dokumen" description="PDF, Word, Excel, PowerPoint, gambar, ZIP, teks, atau video hingga 50 MB.">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="file">File</Label>
            <Input id="file" name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.zip,.txt,.mp4,.mov,.webm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Keterangan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
            <Input id="description" name="description" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Mengunggah…" : "Unggah dokumen"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
