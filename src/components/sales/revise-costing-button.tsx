"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { reviseCostingSheetAction } from "@/server/sales/costing";

/**
 * Bumps a costing sheet's revision counter (".R1", ".R2"...) when it's being
 * meaningfully reworked and recirculated — separate from the always-on Edit
 * button since editing alone doesn't imply a new revision label.
 */
export function ReviseCostingButton({ costingId }: { costingId: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onClick() {
    setPending(true);
    const res = await reviseCostingSheetAction(costingId);
    setPending(false);
    if (res.ok) {
      toast({ title: "Marked as a new revision", variant: "success" });
      router.refresh();
    } else {
      toast({ title: "Unable to revise", description: res.error, variant: "destructive" });
    }
  }

  return (
    <Button variant="outline" disabled={pending} onClick={onClick}>
      Buat Revisi (R+1)
    </Button>
  );
}
