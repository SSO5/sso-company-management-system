"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createContract } from "@/server/sales/purchase-orders";

export function ContractFormDialog({
  trigger, customers, projects,
}: {
  trigger: React.ReactNode;
  customers: { id: string; companyName: string; number: string }[];
  projects: { id: string; number: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await createContract(Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) { toast({ title: "Contract created", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Unable to save contract", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen} title="New Contract">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Customer</Label>
              <Select name="customerId" required defaultValue="">
                <option value="" disabled>Select</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Linked Project (optional)</Label>
              <Select name="projectId" defaultValue="">
                <option value="">None</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Contract Value (IDR)</Label>
              <Input name="contractValue" type="number" min={0} required />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              {/* "Active" is deliberately not selectable here — a contract only
                  becomes Active through the "Aktifkan" action on the list page,
                  which requires uploading the actually-signed document. This
                  dropdown is for entering historical/edge-case records
                  (already expired/terminated/completed), not for claiming a
                  new contract is live without evidence. */}
              <Select name="status" defaultValue="DRAFT">
                <option value="DRAFT">Draft</option>
                <option value="EXPIRED">Expired</option>
                <option value="TERMINATED">Terminated</option>
                <option value="COMPLETED">Completed</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input name="startDate" type="date" required />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input name="endDate" type="date" required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Create Contract"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
