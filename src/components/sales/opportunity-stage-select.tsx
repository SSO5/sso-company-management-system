"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { updateOpportunityStage } from "@/server/sales/opportunities";
import type { OpportunityStatus } from "@prisma/client";

// Won/Lost are intentionally left out: they're terminal, evidence-backed
// outcomes reachable only via "Mark Won"/"Mark Lost" on the deal's
// quotation (see updateOpportunityStage's server-side guard), never via
// this plain stage picker.
const STAGES: OpportunityStatus[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION"];

export function OpportunityStageSelect({ id, status }: { id: string; status: OpportunityStatus }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  if (status === "WON" || status === "LOST") {
    return <Badge variant={status === "WON" ? "success" : "destructive"}>{status}</Badge>;
  }

  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as OpportunityStatus;
        startTransition(async () => {
          const res = await updateOpportunityStage(id, value);
          if (res.ok) router.refresh();
          else toast({ title: "Unable to update stage", description: res.error, variant: "destructive" });
        });
      }}
      className="h-7 text-xs"
    >
      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
    </Select>
  );
}
