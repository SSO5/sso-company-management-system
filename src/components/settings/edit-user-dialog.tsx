"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { updateUserAction, deleteUser } from "@/server/settings/users";
import { TITLE_OPTIONS } from "@/lib/validation/auth";
import { Pencil, Trash2 } from "lucide-react";

interface Props {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    title: string | null;
    whatsappNumber: string | null;
    isActive: boolean;
    signatureImageUrl: string | null;
  };
  /** Disallow deleting the account currently signed in. */
  isSelf: boolean;
}

export function EditUserDialog({ user, isSelf }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const signaturePreviewSrc = user.signatureImageUrl
    ? `/api/branding/${user.signatureImageUrl.replace(/^branding\//, "")}`
    : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await updateUserAction(fd);
    setPending(false);
    if (res.ok) {
      toast({ title: "User updated", variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Unable to update user", description: res.error, variant: "destructive" });
    }
  }

  async function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    const res = await deleteUser(user.id);
    setDeleting(false);
    if (res.ok) {
      toast({ title: "User deleted", variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Unable to delete user", description: res.error, variant: "destructive" });
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setConfirmDelete(false); }}
        title="Edit User"
        description="Update profile, jabatan, status, or upload the signature (TTD) used on Quotation PDFs."
      >
        <form onSubmit={onSubmit} className="space-y-3" encType="multipart/form-data">
          <input type="hidden" name="id" value={user.id} />
          <div className="space-y-1"><Label>Name</Label><Input name="name" defaultValue={user.name} required /></div>
          <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" defaultValue={user.email} required /></div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select name="role" defaultValue={user.role}>
              <option value="ADMIN">Admin</option><option value="SALES">Sales</option>
              <option value="FINANCE">Finance</option><option value="PROJECT_MANAGER">Project Manager</option>
              <option value="VIEWER">Viewer (view-only)</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Jabatan (title on PDF signature block)</Label>
            <Input name="title" list="title-options" defaultValue={user.title ?? ""} placeholder="e.g. Director" />
            <datalist id="title-options">
              {TITLE_OPTIONS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label>WhatsApp <span className="text-muted-foreground">(untuk notifikasi approval/deadline)</span></Label>
            <Input name="whatsappNumber" type="tel" defaultValue={user.whatsappNumber ?? ""} placeholder="0812xxxxxxxxx" />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select name="isActive" defaultValue={user.isActive ? "true" : "false"}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reset Password <span className="text-muted-foreground">(leave blank to keep current)</span></Label>
            <Input name="password" type="password" minLength={8} placeholder="••••••••" />
          </div>
          <div className="space-y-1">
            <Label>Signature (TTD)</Label>
            {signaturePreviewSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signaturePreviewSrc} alt="Current signature" className="mb-1 h-14 w-auto rounded border border-border bg-white p-1" />
            )}
            <Input name="signature" type="file" accept="image/png,image/jpeg" />
            <p className="text-xs text-muted-foreground">PNG/JPG, latar transparan disarankan. Ukuran akan disesuaikan otomatis di PDF.</p>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            {!isSelf ? (
              <Button
                type="button"
                variant={confirmDelete ? "destructive" : "outline"}
                size="sm"
                disabled={deleting}
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Deleting..." : confirmDelete ? "Confirm delete?" : "Hapus User"}
              </Button>
            ) : <span className="text-xs text-muted-foreground">You can&apos;t delete your own account.</span>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save Changes"}</Button>
            </div>
          </div>
        </form>
      </Dialog>
    </>
  );
}
