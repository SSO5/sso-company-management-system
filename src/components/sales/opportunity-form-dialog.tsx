"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createOpportunity } from "@/server/sales/opportunities";

export function OpportunityFormDialog({
  trigger,
  customers,
  contacts,
  salesUsers,
}: {
  trigger: React.ReactElement;
  customers: { id: string; companyName: string; number: string }[];
  contacts: { id: string; customerId: string; name: string }[];
  salesUsers: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const router = useRouter();
  const { toast } = useToast();
  const filteredContacts = contacts.filter((c) => c.customerId === customerId);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await createOpportunity(Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) {
      toast({ title: "Opportunity created", variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Unable to save opportunity", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <DialogTrigger trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen} title="New Opportunity">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">Opportunity Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="customerId">Customer</Label>
              <Select id="customerId" name="customerId" required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="" disabled>Select</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="contactId">Contact</Label>
              <Select id="contactId" name="contactId" defaultValue="">
                <option value="">None</option>
                {filteredContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="salesPicId">Sales PIC</Label>
              <Select id="salesPicId" name="salesPicId" required defaultValue="">
                <option value="" disabled>Select</option>
                {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="estimatedValue">Estimated Value (IDR)</Label>
              <Input id="estimatedValue" name="estimatedValue" type="number" min={0} step="1" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="probability">Probability (%)</Label>
              <Input id="probability" name="probability" type="number" min={0} max={100} defaultValue={10} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expectedClosingDate">Expected Closing Date</Label>
              <Input id="expectedClosingDate" name="expectedClosingDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="source">Source</Label>
              <Input id="source" name="source" placeholder="Referral, website, tender..." />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Create Opportunity"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
