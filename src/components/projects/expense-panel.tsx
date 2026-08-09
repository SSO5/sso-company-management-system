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
import { createExpense } from "@/server/projects/tasks";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

interface Expense {
  id: string; number: string; category: string; description: string; date: Date;
  total: unknown; paymentStatus: string; createdBy: { name: string };
}

const CATEGORIES = ["LABOR", "MATERIALS", "TRANSPORTATION", "ACCOMMODATION", "VENDOR", "EQUIPMENT", "MARKETING", "OTHER"];

export function ExpensePanel({ projectId, expenses }: { projectId: string; expenses: Expense[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await createExpense({ ...Object.fromEntries(fd.entries()), projectId });
    if (res.ok) { toast({ title: "Expense recorded", variant: "success" }); setOpen(false); router.refresh(); }
    else toast({ title: "Unable to record expense", description: res.error, variant: "destructive" });
  }

  const totalCost = expenses.reduce((s, e) => s + Number(e.total), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Total recorded cost: <span className="font-medium text-foreground">{formatCurrency(totalCost)}</span></p>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Expense</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {expenses.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono text-xs">{e.number}</TableCell>
              <TableCell>{e.category}</TableCell>
              <TableCell>{e.description}</TableCell>
              <TableCell>{formatDate(e.date)}</TableCell>
              <TableCell>{formatCurrency(Number(e.total))}</TableCell>
              <TableCell><Badge variant={e.paymentStatus === "PAID" ? "success" : "secondary"}>{e.paymentStatus}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {expenses.length === 0 && <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>}

      <Dialog open={open} onOpenChange={setOpen} title="Record Project Expense">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select name="category" defaultValue="OTHER">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="space-y-1"><Label>Date</Label><Input name="date" type="date" required /></div>
            <div className="space-y-1"><Label>Amount (IDR)</Label><Input name="amount" type="number" min={0} required /></div>
            <div className="space-y-1"><Label>Tax (IDR)</Label><Input name="tax" type="number" min={0} defaultValue={0} /></div>
            <div className="space-y-1"><Label>Vendor</Label><Input name="vendor" /></div>
            <div className="space-y-1">
              <Label>Payment Status</Label>
              <Select name="paymentStatus" defaultValue="UNPAID">
                <option value="UNPAID">Unpaid</option><option value="PAID">Paid</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Description</Label><Textarea name="description" rows={2} required /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Record Expense</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
