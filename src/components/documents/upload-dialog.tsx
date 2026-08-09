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
    if (res.ok) { toast({ title: "File uploaded", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Upload failed", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Upload className="h-3.5 w-3.5" /> Upload</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Upload Document" description="PDF, Word, Excel, PowerPoint, images, ZIP or text — up to 50MB.">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="file">File</Label>
            <Input id="file" name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.zip,.txt" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" name="description" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Uploading..." : "Upload"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
