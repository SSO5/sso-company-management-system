"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { invoiceSchema, type InvoiceInput } from "@/lib/validation/finance";
import { calcInvoiceTotals } from "@/lib/workflows/calculations";
import { formatCurrency } from "@/lib/utils";
import { createInvoiceAction } from "@/server/finance/invoices";
import { Plus, Trash2 } from "lucide-react";

interface Props {
  customers: { id: string; companyName: string; number: string }[];
  projects: { id: string; customerId: string; number: string }[];
  contacts: { id: string; customerId: string; name: string }[];
  salesUsers: { id: string; name: string }[];
}

function dateInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function InvoiceForm({ customers, projects, contacts, salesUsers }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const { register, control, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      discount: 0,
      items: [{ groupLabel: "", description: "", quantity: 1, unit: "unit", unitPrice: 0, taxPercent: 11, isNote: false }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchedItems = watch("items");
  const watchedDiscount = watch("discount");
  const watchedCustomerId = watch("customerId");
  const totals = useMemo(() => calcInvoiceTotals(watchedItems || [], Number(watchedDiscount || 0)), [watchedItems, watchedDiscount]);
  const filteredProjects = projects.filter((p) => p.customerId === watchedCustomerId);
  const filteredContacts = contacts.filter((c) => c.customerId === watchedCustomerId);

  async function onSubmit(data: InvoiceInput) {
    const res = await createInvoiceAction(data);
    if (res.ok) {
      toast({ title: "Invoice created", variant: "success" });
      router.push(`/finance/invoices/${res.data.id}`);
    } else {
      toast({ title: "Unable to save invoice", description: res.error, variant: "destructive" });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
        <div className="space-y-1">
          <Label>Customer</Label>
          <Select {...register("customerId")} defaultValue="">
            <option value="" disabled>Select</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
          </Select>
          {errors.customerId && <p className="text-xs text-destructive">{errors.customerId.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Contact / Attn (optional)</Label>
          <Select {...register("contactId")} defaultValue="">
            <option value="">None</option>
            {filteredContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Project (optional)</Label>
          <Select {...register("projectId")} defaultValue="">
            <option value="">None</option>
            {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Sales PIC (optional)</Label>
          <Select {...register("salesPicId")} defaultValue="">
            <option value="">None</option>
            {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Invoice Date</Label>
          <Controller control={control} name="invoiceDate" render={({ field }) => (
            <Input type="date" value={dateInputValue(field.value)} onChange={(e) => field.onChange(new Date(e.target.value))} />
          )} />
        </div>
        <div className="space-y-1">
          <Label>Due Date</Label>
          <Controller control={control} name="dueDate" render={({ field }) => (
            <Input type="date" value={dateInputValue(field.value)} onChange={(e) => field.onChange(new Date(e.target.value))} />
          )} />
        </div>
        <div className="space-y-1">
          <Label>Customer PO No. (optional)</Label>
          <Input {...register("customerPO")} placeholder="EPC-L/2026-0450" />
        </div>
        <div className="space-y-1">
          <Label>PO Date (optional)</Label>
          <Controller control={control} name="poDate" render={({ field }) => (
            <Input type="date" value={dateInputValue(field.value)} onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)} />
          )} />
        </div>
        <div className="space-y-1">
          <Label>Delivery Date (optional)</Label>
          <Controller control={control} name="deliveryDate" render={({ field }) => (
            <Input type="date" value={dateInputValue(field.value)} onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)} />
          )} />
        </div>
        <div className="space-y-1">
          <Label>Job No. (optional)</Label>
          <Input {...register("jobNo")} placeholder="JO-2607-003" />
        </div>
        <div className="space-y-1">
          <Label>Down Payment % (optional)</Label>
          <Input type="number" step="any" min={0} max={100} {...register("dpPercent")} placeholder="e.g. 20 for a DP invoice" />
          <p className="text-[11px] text-muted-foreground">Leave blank if this invoice bills the full amount.</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <Label>Invoice Items</Label>
            <p className="text-[11px] text-muted-foreground">
              Fill &quot;Group&quot; to start a bold section heading (e.g. &quot;1. OVERHOUL GEARBOX...&quot;) — leave later rows in the same
              group blank and it keeps grouping under the last one. Tick &quot;Note only&quot; for a scope bullet with no price of its own.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => append({ groupLabel: "", description: "", quantity: 1, unit: "unit", unitPrice: 0, taxPercent: 11, isNote: false })}>
            <Plus className="h-3.5 w-3.5" /> Add Item
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Group</TableHead><TableHead>Description</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>Unit Price</TableHead><TableHead>Tax %</TableHead><TableHead>Note only</TableHead><TableHead>Total</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, idx) => {
              const isNote = watchedItems?.[idx]?.isNote;
              return (
                <TableRow key={field.id}>
                  <TableCell className="min-w-[140px]"><Input {...register(`items.${idx}.groupLabel`)} placeholder="(leave blank to continue group)" /></TableCell>
                  <TableCell className="min-w-[200px]"><Input {...register(`items.${idx}.description`)} /></TableCell>
                  <TableCell className="w-20"><Input type="number" step="any" disabled={isNote} {...register(`items.${idx}.quantity`)} /></TableCell>
                  <TableCell className="w-20"><Input disabled={isNote} {...register(`items.${idx}.unit`)} /></TableCell>
                  <TableCell className="w-32"><Input type="number" step="any" disabled={isNote} {...register(`items.${idx}.unitPrice`)} /></TableCell>
                  <TableCell className="w-20"><Input type="number" step="any" disabled={isNote} {...register(`items.${idx}.taxPercent`)} /></TableCell>
                  <TableCell className="w-16"><input type="checkbox" className="h-4 w-4" {...register(`items.${idx}.isNote`)} /></TableCell>
                  <TableCell className="w-32 text-sm">{formatCurrency(totals.lineTotals[idx] ?? 0)}</TableCell>
                  <TableCell><Button type="button" size="icon" variant="ghost" onClick={() => remove(idx)} disabled={fields.length === 1}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Discount</span><Input type="number" step="any" className="h-7 w-28 text-right" {...register("discount")} /></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(totals.tax)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Grand Total</span><span>{formatCurrency(totals.grandTotal)}</span></div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <Label>Note (optional, printed on PDF)</Label>
        <Textarea {...register("notes")} rows={4} placeholder={"1. Harga sudah termasuk:\n   a. ...\n2. Semua sparepart yang diganti..."} className="mt-1" />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Create Invoice"}</Button>
      </div>
    </form>
  );
}
