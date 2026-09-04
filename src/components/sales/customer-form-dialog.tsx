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
import { createCustomer } from "@/server/sales/customers";

export function CustomerFormDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    const res = await createCustomer(payload);
    setPending(false);
    if (res.ok) {
      toast({ title: "Customer created", variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Unable to save customer", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <DialogTrigger trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen} title="New Customer" description="Creates a numbered customer record (CUS-YYYY-####).">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="companyName">Company Name</Label>
              <Input id="companyName" name="companyName" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customerType">Type</Label>
              <Select id="customerType" name="customerType" defaultValue="PROSPECT">
                <option value="PROSPECT">Prospect</option>
                <option value="CUSTOMER">Customer</option>
                <option value="PARTNER">Partner</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" name="industry" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" name="address" rows={2} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="province">Province</Label>
              <Input id="province" name="province" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="taxId">Tax ID (NPWP)</Label>
              <Input id="taxId" name="taxId" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Create Customer"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
