"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { deletePurchaseOrder } from "@/server/sales/purchase-orders";
import { Trash2 } from "lucide-react";

/**
 * Financial record, so this asks for confirmation before soft-deleting —
 * unlike DocumentRowActions' one-click trash for a plain uploaded file.
 * Used to clean up mistakes like a duplicate PO entered under an
 * SSO-invented number before "number = customer's own reference" was the
 * rule, which double-counts the project's PO total until removed.
 */
export function PoRowActions({ id, number }: { id: string; number: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onDelete() {
    if (!window.confirm(`Hapus PO "${number}"? Ini akan mengurangi Total Nilai PO project ini.`)) return;
    setPending(true);
    const res = await deletePurchaseOrder(id);
    setPending(false);
    if (res.ok) { toast({ title: "PO dihapus", variant: "success" }); router.refresh(); }
    else toast({ title: "Tidak bisa menghapus PO", description: res.error, variant: "destructive" });
  }

  return (
    <Button size="icon" variant="ghost" title="Hapus PO" disabled={pending} onClick={onDelete}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
