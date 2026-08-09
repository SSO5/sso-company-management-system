"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createUser } from "@/server/settings/users";
import { TITLE_OPTIONS } from "@/lib/validation/auth";
import { Plus } from "lucide-react";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await createUser(Object.fromEntries(fd.entries()));
    setPending(false);
    if (res.ok) { toast({ title: "User created", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Unable to create user", description: res.error, variant: "destructive" });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New User</Button>
      <Dialog open={open} onOpenChange={setOpen} title="New User" description="A team of 3 today, designed to scale far beyond it.">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input name="name" required /></div>
          <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" required /></div>
          <div className="space-y-1"><Label>Temporary Password</Label><Input name="password" type="password" minLength={8} required /></div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select name="role" defaultValue="SALES">
              <option value="ADMIN">Admin</option><option value="SALES">Sales</option>
              <option value="FINANCE">Finance</option><option value="PROJECT_MANAGER">Project Manager</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Jabatan <span className="text-muted-foreground">(optional, shown on PDF signature block)</span></Label>
            <Input name="title" list="new-title-options" placeholder="e.g. Marketing Manager" />
            <datalist id="new-title-options">
              {TITLE_OPTIONS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Create User"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
