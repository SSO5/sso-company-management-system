"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { deleteOpportunityAction } from "@/server/sales/opportunities";

/**
 * ADMIN-only "trash" action on an Opportunity card (spec: cleaning up a
 * mistaken/trial deal shouldn't require a terminal script). Cascades to its
 * Quotation(s), Costing Sheet(s), Project (if Won), folders, and documents —
 * so it requires typing the Opportunity's own number to confirm, the same
 * "type to confirm" pattern used for genuinely destructive actions.
 */
export function OpportunityDeleteButton({ id, number, size = "icon" }: { id: string; number: string; size?: "icon" | "sm" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);

  async function confirmDelete() {
    setPending(true);
    const res = await deleteOpportunityAction(id);
    setPending(false);
    if (res.ok) {
      setOpen(false);
      toast({ title: `Opportunity ${number} dihapus`, variant: "success" });
      router.push("/sales/opportunities");
      router.refresh();
    } else {
      toast({ title: "Gagal menghapus", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      {size === "icon" ? (
        <button
          type="button"
          title="Hapus Opportunity"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" /> Hapus Opportunity
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Hapus Opportunity Permanen"
        description="Ini akan ikut menghapus Quotation, Costing Sheet, folder, dan dokumen di dalamnya — kalau deal ini sudah Won, Project-nya juga ikut terhapus. Customer tidak ikut terhapus. Tindakan ini tidak bisa dibatalkan."
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Ketik nomor <span className="font-mono">{number}</span> untuk konfirmasi</Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={number} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button variant="destructive" disabled={confirmText !== number || pending} onClick={confirmDelete}>
              Hapus Permanen
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
