"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { convertRevisedCostingToQuotationAction } from "@/server/sales/costing";
import { RefreshCw } from "lucide-react";

/**
 * The explicit, user-clicked step after "Buat Revisi" + Edit: pushes the
 * costing sheet's newly edited numbers into the quotation it's already
 * linked to (as that quotation's current revision) and locks the costing
 * sheet back to CONVERTED. Deliberately not automatic on Save — mirrors the
 * very first "Convert to Quotation" action having its own explicit click.
 */
export function ConvertRevisedCostingButton({ costingId, quotationLabel }: { costingId: string; quotationLabel: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onClick() {
    setPending(true);
    const res = await convertRevisedCostingToQuotationAction(costingId);
    setPending(false);
    if (res.ok) {
      toast({ title: `Quotation ${quotationLabel} updated`, variant: "success" });
      router.refresh();
    } else {
      toast({ title: "Unable to convert to quotation", description: res.error, variant: "destructive" });
    }
  }

  return (
    <Button disabled={pending} onClick={onClick}>
      <RefreshCw className="h-4 w-4" /> Convert to Quotation ({quotationLabel})
    </Button>
  );
}
