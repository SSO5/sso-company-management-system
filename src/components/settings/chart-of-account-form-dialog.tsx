"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createChartOfAccountAction, updateChartOfAccountAction } from "@/server/finance/chart-of-accounts";
import { Plus, Pencil } from "lucide-react";

interface Account {
  id: string; code: string; name: string; type: string; description: string | null;
  isActive: boolean; openingBalance: unknown; openingBalanceDate: Date | null;
}

const TYPES = [
  { value: "ASSET", label: "Aset" },
  { value: "LIABILITY", label: "Liabilitas" },
  { value: "EQUITY", label: "Ekuitas" },
  { value: "REVENUE", label: "Pendapatan" },
  { value: "EXPENSE", label: "Beban" },
];

/**
 * Create-or-edit dialog for one ChartOfAccount row. Same trigger-owns-dialog
 * pattern as create-user-dialog.tsx; edit mode is just this same form
 * pre-filled, passed an `account` to switch which server action it calls.
 */
export function ChartOfAccountFormDialog({ account }: { account?: Account }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(account);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(fd.entries());
    // Checkboxes are absent from FormData entirely when unchecked — read the
    // checked state directly instead of relying on key presence.
    payload.isActive = (e.currentTarget.elements.namedItem("isActive") as HTMLInputElement).checked;

    const res = isEdit
      ? await updateChartOfAccountAction(account!.id, payload)
      : await createChartOfAccountAction(payload);
    setPending(false);
    if (res.ok) {
      toast({ title: isEdit ? "Akun diperbarui" : "Akun dibuat", variant: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Gagal menyimpan akun", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      {isEdit ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
      ) : (
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Akun Baru</Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={isEdit ? "Edit Akun" : "Akun Baru"}
        description="Kode dan tipe akun mengikuti standar bagan akun Indonesia (1-xxx Aset, 2-xxx Liabilitas, 3-xxx Ekuitas, 4-xxx Pendapatan, 5/6-xxx Beban)."
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Kode Akun</Label><Input name="code" defaultValue={account?.code} placeholder="1-1000" required /></div>
            <div className="space-y-1">
              <Label>Tipe</Label>
              <Select name="type" defaultValue={account?.type ?? "EXPENSE"}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Nama Akun</Label><Input name="name" defaultValue={account?.name} placeholder="Beban Gaji Direksi" required /></div>
          <div className="space-y-1"><Label>Keterangan <span className="text-muted-foreground">(opsional)</span></Label><Textarea name="description" defaultValue={account?.description ?? ""} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Saldo Awal (IDR)</Label>
              <Input name="openingBalance" type="number" defaultValue={account ? Number(account.openingBalance) : 0} />
            </div>
            <div className="space-y-1">
              <Label>Per Tanggal <span className="text-muted-foreground">(opsional)</span></Label>
              <Input
                name="openingBalanceDate" type="date"
                defaultValue={account?.openingBalanceDate ? new Date(account.openingBalanceDate).toISOString().slice(0, 10) : ""}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={account?.isActive ?? true} className="h-4 w-4 rounded border-border" />
            Akun aktif
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Akun"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
