"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createPurchaseOrder } from "@/server/sales/purchase-orders";

export function PurchaseOrderFormDialog({
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
    const res = await createPurchaseOrder(Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) { toast({ title: "Purchase order created", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Unable to save PO", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen} title="New Purchase Order">
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
              <Label>PO Number (dari customer)</Label>
              <Input name="number" required placeholder="EPC-L/2026-0450" />
            </div>
            <div className="space-y-1">
              <Label>PO Date</Label>
              <Input name="poDate" type="date" required />
            </div>
            <div className="space-y-1">
              <Label>PO Value (IDR)</Label>
              <Input name="poValue" type="number" min={0} required />
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input name="startDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input name="endDate" type="date" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Create PO"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
