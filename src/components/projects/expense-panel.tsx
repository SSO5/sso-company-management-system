"use client";
import { displayLabel } from "@/lib/display-labels";
import { can } from "@/lib/permissions";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";
import {
  createExpense,
  submitExpenseAction,
  approveExpenseAction,
  rejectExpenseAction,
  markExpensePaidAction,
} from "@/server/projects/tasks";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Truck } from "lucide-react";
import type { UserRole } from "@prisma/client";

interface Expense {
  id: string;
  number: string;
  category: string;
  description: string;
  date: Date;
  total: unknown;
  paymentStatus: string;
  approvalStatus: string;
  submittedById: string | null;
  rejectionReason: string | null;
  createdBy: { name: string };
  vendorPurchaseOrderId: string | null;
}

const CATEGORIES = [
  "LABOR",
  "MATERIALS",
  "TRANSPORTATION",
  "ACCOMMODATION",
  "VENDOR",
  "EQUIPMENT",
  "MARKETING",
  "OTHER",
];

const APPROVAL_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

export function ExpensePanel({
  projectId,
  expenses,
  role,
  costTypes = [],
}: {
  projectId: string;
  expenses: Expense[];
  role: UserRole;
  /** Jenis biaya aktif; kosong berarti daftarnya belum diisi Admin. */
  costTypes?: { id: string; code: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [payId, setPayId] = useState<string | null>(null);
  const [payFile, setPayFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const isAdmin = role === "ADMIN";
  // Recording an expense is a PM's job; actually disbursing/confirming
  // payment against it (and attaching the receipt) is Finance's — kept
  // separate from `isAdmin` so this isn't accidentally an Admin-only gate.
  const canMarkPaid = role === "ADMIN" || role === "FINANCE" || role === "IT";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await createExpense({
      ...Object.fromEntries(fd.entries()),
      projectId,
    });
    if (res.ok) {
      toast({ title: "Biaya dicatat", variant: "success" });
      setOpen(false);
      router.refresh();
    } else
      toast({
        title: "Tidak dapat mencatat biaya",
        description: res.error,
        variant: "destructive",
      });
  }

  async function onMarkPaid(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payId) return;
    const fd = new FormData(e.currentTarget);
    fd.set("id", payId);
    fd.set("projectId", projectId);
    setPending(true);
    const res = await markExpensePaidAction(fd);
    setPending(false);
    if (res.ok) {
      toast({ title: "Pembayaran biaya dicatat", variant: "success" });
      setPayId(null);
      setPayFile(null);
      router.refresh();
    } else
      toast({
        title: "Tidak dapat mencatat pembayaran",
        description: res.error,
        variant: "destructive",
      });
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (res.ok) router.refresh();
    else
      toast({
        title: "Tindakan gagal",
        description: res.error,
        variant: "destructive",
      });
  }

  const totalCost = expenses.reduce((s, e) => s + Number(e.total), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Total biaya tercatat:{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(totalCost)}
          </span>
        </p>
        <Button
          disabled={!can(role, "project", "create")}
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Tambah Biaya
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nomor</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead>Keterangan</TableHead>
            <TableHead>Tanggal</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Pembayaran</TableHead>
            <TableHead>Persetujuan</TableHead>
            <TableHead>Tindakan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono text-xs">{e.number}</TableCell>
              <TableCell>{displayLabel(e.category)}</TableCell>
              <TableCell>
                {e.description}
                {e.vendorPurchaseOrderId && (
                  <Link
                    href={`/procurement/vendor-po/${e.vendorPurchaseOrderId}`}
                    className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                    title="Dari Vendor PO"
                  >
                    <Truck className="h-3 w-3" /> PO
                  </Link>
                )}
              </TableCell>
              <TableCell>{formatDate(e.date)}</TableCell>
              <TableCell>{formatCurrency(Number(e.total))}</TableCell>
              <TableCell>
                <Badge
                  variant={e.paymentStatus === "PAID" ? "success" : "secondary"}
                >
                  {displayLabel(e.paymentStatus)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={APPROVAL_VARIANT[e.approvalStatus] ?? "default"}
                >
                  {displayLabel(e.approvalStatus)}
                </Badge>
                {e.approvalStatus === "REJECTED" && e.rejectionReason && (
                  <p className="mt-0.5 text-[11px] text-destructive">
                    {e.rejectionReason}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1.5">
                  {e.approvalStatus === "DRAFT" &&
                    can(role, "project", "update") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() => submitExpenseAction(e.id, projectId))
                        }
                      >
                        Submit
                      </Button>
                    )}
                  {e.approvalStatus === "SUBMITTED" && isAdmin && (
                    <>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(() => approveExpenseAction(e.id, projectId))
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() => setRejectId(e.id)}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {e.approvalStatus === "APPROVED" &&
                    e.paymentStatus !== "PAID" &&
                    canMarkPaid && (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => setPayId(e.id)}
                      >
                        Mark as Paid
                      </Button>
                    )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {expenses.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Belum ada biaya tercatat.
        </p>
      )}

      <Dialog
        open={!!rejectId}
        onOpenChange={(v) => !v && setRejectId(null)}
        title="Reject Expense"
        description="Provide a reason — this is recorded on the audit trail."
      >
        <div className="space-y-3">
          <Textarea
            placeholder="Reason for rejection"
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectId(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!reason || pending}
              onClick={() => {
                const id = rejectId!;
                setRejectId(null);
                run(() => rejectExpenseAction(id, projectId, reason)).then(() =>
                  setReason(""),
                );
              }}
            >
              Reject
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!payId}
        onOpenChange={(v) => {
          if (!v) {
            setPayId(null);
            setPayFile(null);
          }
        }}
        title="Mark Expense as Paid"
        description="Upload kwitansi/bukti transfer — expense tidak bisa ditandai Paid tanpa bukti bayar."
      >
        <form onSubmit={onMarkPaid} className="space-y-3">
          <div className="space-y-1">
            <Label>
              Bukti Bayar <span className="text-destructive">*</span>
            </Label>
            <Input
              name="file"
              type="file"
              required
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(ev) => setPayFile(ev.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-muted-foreground">
              Foto/PDF kwitansi atau bukti transfer wajib diupload.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPayId(null);
                setPayFile(null);
              }}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending || !payFile}>
              {pending ? "Saving..." : "Mark as Paid"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen} title="Record Project Expense">
        <form onSubmit={onSubmit} className="space-y-3">
          {/* Jenis biaya lebih rinci daripada kategori, dan kategorinya
              DITURUNKAN dari jenis yang dipilih di server — dua kolom yang
              menyatakan hal sama tapi bisa berbeda akan membuat laporan per
              kategori dan papan biaya per jenis saling bertentangan. */}
          {costTypes.length > 0 && (
            <div className="space-y-1">
              <Label>
                Jenis biaya{" "}
                <span className="text-muted-foreground">(disarankan)</span>
              </Label>
              <Select name="costTypeId" defaultValue="">
                <option value="">— Tanpa jenis biaya —</option>
                {costTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.name}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Memilih jenis biaya membuat pengeluaran ini bisa diadu dengan pagu
                baseline. Tanpa itu, ia hanya masuk hitungan total.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>
                Kategori
                {costTypes.length > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    (diabaikan kalau jenis biaya dipilih)
                  </span>
                )}
              </Label>
              <Select name="category" defaultValue="OTHER">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {displayLabel(c)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tanggal</Label>
              <Input name="date" type="date" required />
            </div>
            <div className="space-y-1">
              <Label>Nilai (Rp)</Label>
              <Input name="amount" type="number" min={0} required />
            </div>
            <div className="space-y-1">
              <Label>Pajak (Rp)</Label>
              <Input name="tax" type="number" min={0} defaultValue={0} />
            </div>
            <div className="space-y-1">
              <Label>Vendor</Label>
              <Input name="vendor" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Setiap expense baru dimulai sebagai Unpaid — status Paid hanya bisa
            diberikan setelah expense disetujui, lewat tombol &quot;Mark as
            Paid&quot; dengan bukti bayar terlampir.
          </p>
          <div className="space-y-1">
            <Label>Keterangan</Label>
            <Textarea name="description" rows={2} required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit">Record Expense</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
