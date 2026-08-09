"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { updateOpportunityStage } from "@/server/sales/opportunities";
import type { OpportunityStatus } from "@prisma/client";

const STAGES: OpportunityStatus[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

export function OpportunityStageSelect({ id, status }: { id: string; status: OpportunityStatus }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

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
