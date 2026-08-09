"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createContact } from "@/server/sales/contacts";

export function ContactFormDialog({
  trigger,
  customers,
}: {
  trigger: React.ReactNode;
  customers: { id: string; companyName: string; number: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload = { ...Object.fromEntries(fd.entries()), isPrimary: fd.get("isPrimary") === "on" };
    const res = await createContact(payload);
    setPending(false);
    if (res.ok) {
      toast({ title: "Contact added", variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Unable to save contact", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen} title="New Contact">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="customerId">Customer</Label>
            <Select id="customerId" name="customerId" required defaultValue="">
              <option value="" disabled>Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="position">Position</Label>
              <Input id="position" name="position" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input id="whatsapp" name="whatsapp" />
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <input id="isPrimary" name="isPrimary" type="checkbox" className="h-4 w-4" />
              <Label htmlFor="isPrimary">Primary contact</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Add Contact"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
