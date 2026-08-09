"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { listTrash, restoreDocument, permanentDelete } from "@/server/documents/documents";
import { formatDateTime } from "@/lib/utils";

interface TrashDoc {
  id: string; originalName: string; deletedAt: Date | null;
  deletedBy: { name: string } | null; folder: { path: string } | null;
}

export default function TrashPage() {
  const [docs, setDocs] = useState<TrashDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    const data = await listTrash();
    setDocs(data as unknown as TrashDoc[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Trash</h1><p className="text-sm text-muted-foreground">Deleted files are kept here until permanently removed.</p></div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : docs.length === 0 ? (
        <EmptyState title="Trash is empty" />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Original Location</TableHead><TableHead>Deleted By</TableHead><TableHead>Deleted At</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.originalName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{d.folder?.path ?? "-"}</TableCell>
                <TableCell>{d.deletedBy?.name ?? "-"}</TableCell>
                <TableCell>{formatDateTime(d.deletedAt)}</TableCell>
                <TableCell className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={async () => {
                    const res = await restoreDocument(d.id);
                    if (res.ok) load(); else toast({ title: "Unable to restore", description: res.error, variant: "destructive" });
                  }}>Restore</Button>
                  <Button size="sm" variant="destructive" onClick={async () => {
                    if (!confirm("Permanently delete this file? This cannot be undone.")) return;
                    const res = await permanentDelete(d.id);
                    if (res.ok) load(); else toast({ title: "Unable to delete", description: res.error, variant: "destructive" });
                  }}>Delete Permanently</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
