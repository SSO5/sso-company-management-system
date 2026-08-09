"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { trashDocument } from "@/server/documents/documents";
import { Download, Eye, Trash2 } from "lucide-react";

export function DocumentRowActions({ id, folderId }: { id: string; folderId: string }) {
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="flex gap-1">
      <a href={`/api/files/${id}?view=1`} target="_blank" rel="noreferrer">
        <Button size="icon" variant="ghost" title="View / Print"><Eye className="h-3.5 w-3.5" /></Button>
      </a>
      <a href={`/api/files/${id}`} target="_blank" rel="noreferrer">
        <Button size="icon" variant="ghost" title="Download"><Download className="h-3.5 w-3.5" /></Button>
      </a>
      <Button
        size="icon" variant="ghost" title="Move to Trash"
        onClick={async () => {
          const res = await trashDocument(id, folderId);
          if (res.ok) router.refresh();
          else toast({ title: "Unable to delete", description: res.error, variant: "destructive" });
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
