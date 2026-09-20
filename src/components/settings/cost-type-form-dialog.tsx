"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { saveCostTypeAction } from "@/server/settings/cost-types";
import { displayLabel } from "@/lib/display-labels";
import { canDeleteCostType, type CostType } from "@/lib/cost-type";

/**
 * Form tambah atau ubah satu jenis biaya.
 *
 * Pola yang sama dengan ChartOfAccountFormDialog: pemicu memiliki dialognya,
 * dan mode ubah hanyalah form yang sama dengan isian awal.
 *
 * Dua hal yang dijelaskan di dalam form, bukan disembunyikan:
 *
 *   - Akun pembukuan BOLEH kosong. Memaksanya diisi hanya akan membuat orang
 *     memilih akun asal-asalan supaya formnya mau tersimpan, dan akun yang
 *     salah lebih sulit ditemukan daripada akun yang kosong.
 *   - Jenis yang sudah dipakai tidak bisa dihapus. Karena itu saklar
 *     nonaktif diberi keterangan, bukan dibiarkan orang mencari tombol hapus
 *     yang memang tidak ada.
 */

const KELOMPOK = [
  "MATERIALS",
  "LABOR",
  "VENDOR",
  "EQUIPMENT",
  "TRANSPORTATION",
  "ACCOMMODATION",
  "MARKETING",
  "OTHER",
] as const;

export interface AccountOption {
  id: string;
  code: string;
  name: string;
}

export function CostTypeFormDialog({
  costType,
  accounts,
}: {
  costType?: CostType;
  accounts: AccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(costType);
  const terkunci = costType ? !canDeleteCostType(costType) : false;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = e.currentTarget;
    const payload: Record<string, unknown> = Object.fromEntries(
      new FormData(form).entries(),
    );
    // Checkbox tidak muncul di FormData saat tidak dicentang, jadi dibaca
    // langsung dari elemennya.
    payload.isActive = (
      form.elements.namedItem("isActive") as HTMLInputElement
    ).checked;

    const res = await saveCostTypeAction(costType?.id ?? null, payload);
    setPending(false);
    if (res.ok) {
      toast({
        title: isEdit ? "Jenis biaya diperbarui" : "Jenis biaya dibuat",
        variant: "success",
      });
      setOpen(false);
      router.refresh();
    } else {
      toast({
        title: "Belum tersimpan",
        description: res.error,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      {isEdit ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Ubah
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Jenis Biaya Baru
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={isEdit ? "Ubah Jenis Biaya" : "Jenis Biaya Baru"}
        description="Jenis biaya menghubungkan apa yang ditulis di costing dengan apa yang dicatat sebagai pengeluaran, lalu ke akun pembukuannya."
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Kode</Label>
              <Input
                name="code"
                defaultValue={costType?.code}
                placeholder="MAT-PANEL"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Huruf besar, angka, dan tanda hubung. Akan diketik berulang kali
                saat mencatat biaya.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Kelompok</Label>
              <Select name="category" defaultValue={costType?.category ?? "MATERIALS"}>
                {KELOMPOK.map((k) => (
                  <option key={k} value={k}>
                    {displayLabel(k)}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Ember bawaan sistem tempat jenis ini bermuara di laporan.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Nama</Label>
            <Input
              name="name"
              defaultValue={costType?.name}
              placeholder="Material panel dan komponen listrik"
              required
            />
          </div>

          <div className="space-y-1">
            <Label>
              Keterangan <span className="text-muted-foreground">(opsional)</span>
            </Label>
            <Textarea
              name="description"
              defaultValue={costType?.description ?? ""}
              rows={2}
              placeholder="Kapan jenis ini dipakai, dan kapan tidak."
            />
          </div>

          <div className="space-y-1">
            <Label>
              Akun pembukuan{" "}
              <span className="text-muted-foreground">(boleh dikosongkan)</span>
            </Label>
            <Select name="chartOfAccountId" defaultValue="">
              <option value="">— Belum dipetakan —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Boleh diisi nanti. Akun yang dipilih asal-asalan lebih sulit ditemukan
              daripada akun yang memang belum diisi — yang kosong ditandai di daftar.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={costType?.isActive ?? true}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span>
              Aktif
              <span className="block text-[11px] text-muted-foreground">
                Hanya jenis aktif yang muncul saat mencatat biaya baru.
                {terkunci &&
                  " Jenis ini sudah dipakai biaya lama, jadi hanya bisa dinonaktifkan — tidak bisa dihapus."}
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : isEdit ? "Simpan Perubahan" : "Buat Jenis Biaya"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
