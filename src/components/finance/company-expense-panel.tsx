"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  createCompanyExpenseAction,
  submitCompanyExpenseAction,
  approveCompanyExpenseAction,
  rejectCompanyExpenseAction,
  markCompanyExpensePaidAction,
} from "@/server/finance/company-expenses";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { UserRole } from "@prisma/client";

interface Account { id: string; code: string; name: string }
interface CompanyExpense {
  id: string; number: string; description: string; vendor: string | null; date: Date;
  total: unknown; paymentStatus: string; approvalStatus: string; rejectionReason: string | null;
  account: { code: string; name: string } | null; createdBy: { name: string };
}

const APPROVAL_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", SUBMITTED: "warning", APPROVED: "success", REJECTED: "destructive",
};

/**
 * Beban Operasional Perusahaan — General Ledger Phase 1's other half besides
 * the Chart of Accounts itself. Mirrors projects/expense-panel.tsx's exact
 * pattern (same Dialog/Toast/FormData shape, same maker-checker button
 * layout) since this is the same kind of document, just not tied to a
 * Project — see prisma/schema.prisma's CompanyExpense model comment for why
 * it's a separate model instead of making ProjectExpense.projectId optional.
 */
export function CompanyExpensePanel({ expenses, accounts, role }: { expenses: CompanyExpense[]; accounts: Account[]; role: UserRole }) {
  const [open, setOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const isAdmin = role === "ADMIN";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await createCompanyExpenseAction(Object.fromEntries(fd.entries()));
    if (res.ok) { toast({ title: "Beban operasional dicatat", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Gagal mencatat beban", description: res.error, variant: "destructive" });
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (res.ok) router.refresh();
    else toast({ title: "Aksi gagal", description: res.error, variant: "destructive" });
  }

  const total = expenses.reduce((s, e) => s + Number(e.total), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Total tercatat: <span className="font-medium text-foreground">{formatCurrency(total)}</span></p>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Catat Beban</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nomor</TableHead><TableHead>Akun</TableHead><TableHead>Deskripsi</TableHead>
            <TableHead>Tanggal</TableHead><TableHead>Total</TableHead><TableHead>Pembayaran</TableHead>
            <TableHead>Approval</TableHead><TableHead>Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono text-xs">{e.number}</TableCell>
              <TableCell>{e.account ? `${e.account.code} - ${e.account.name}` : <span className="text-muted-foreground">Belum diklasifikasi</span>}</TableCell>
              <TableCell>{e.description}{e.vendor ? ` (${e.vendor})` : ""}</TableCell>
              <TableCell>{formatDate(e.date)}</TableCell>
              <TableCell>{formatCurrency(Number(e.total))}</TableCell>
              <TableCell><Badge variant={e.paymentStatus === "PAID" ? "success" : "secondary"}>{e.paymentStatus}</Badge></TableCell>
              <TableCell>
                <Badge variant={APPROVAL_VARIANT[e.approvalStatus] ?? "default"}>{e.approvalStatus}</Badge>
                {e.approvalStatus === "REJECTED" && e.rejectionReason && (
                  <p className="mt-0.5 text-[11px] text-destructive">{e.rejectionReason}</p>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1.5">
                  {e.approvalStatus === "DRAFT" && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => submitCompanyExpenseAction(e.id))}>Ajukan</Button>
                  )}
                  {e.approvalStatus === "SUBMITTED" && isAdmin && (
                    <>
                      <Button size="sm" disabled={pending} onClick={() => run(() => approveCompanyExpenseAction(e.id))}>Setujui</Button>
                      <Button size="sm" variant="destructive" disabled={pending} onClick={() => setRejectId(e.id)}>Tolak</Button>
                    </>
                  )}
                  {e.approvalStatus === "APPROVED" && e.paymentStatus !== "PAID" && (
                    <Button size="sm" disabled={pending} onClick={() => run(() => markCompanyExpensePaidAction(e.id))}>Tandai Dibayar</Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {expenses.length === 0 && <p className="text-sm text-muted-foreground">Belum ada beban operasional yang dicatat.</p>}

      <Dialog open={!!rejectId} onOpenChange={(v) => !v && setRejectId(null)} title="Tolak Beban Operasional" description="Berikan alasan — akan tercatat di jejak audit.">
        <div className="space-y-3">
          <Textarea placeholder="Alasan penolakan" value={reason} onChange={(ev) => setReason(ev.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectId(null)}>Batal</Button>
            <Button
              variant="destructive"
              disabled={!reason || pending}
              onClick={() => {
                const id = rejectId!;
                setRejectId(null);
                run(() => rejectCompanyExpenseAction(id, reason)).then(() => setReason(""));
              }}
            >
              Tolak
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen} title="Catat Beban Operasional" description="Untuk biaya perusahaan yang bukan biaya satu proyek tertentu — gaji, sewa kantor, listrik, dll.">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Akun</Label>
              <Select name="accountId" defaultValue="">
                <option value="">Belum diklasifikasi</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1"><Label>Tanggal</Label><Input name="date" type="date" required /></div>
            <div className="space-y-1"><Label>Nominal (IDR)</Label><Input name="amount" type="number" min={0} required /></div>
            <div className="space-y-1"><Label>Pajak (IDR)</Label><Input name="tax" type="number" min={0} defaultValue={0} /></div>
            <div className="space-y-1"><Label>Vendor/Pihak <span className="text-muted-foreground">(opsional)</span></Label><Input name="vendor" /></div>
          </div>
          <div className="space-y-1"><Label>Deskripsi</Label><Textarea name="description" rows={2} required placeholder="mis. Gaji Direksi Agustus 2026" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit">Catat Beban</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
