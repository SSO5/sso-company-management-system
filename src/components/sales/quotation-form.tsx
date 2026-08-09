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
import { quotationSchema, DEFAULT_COMMERCIAL_TERMS, type QuotationInput } from "@/lib/validation/sales";
import { calcQuotationTotals } from "@/lib/workflows/calculations";
import { formatCurrency } from "@/lib/utils";
import { createQuotationAction, updateQuotationAction } from "@/server/sales/quotations";
import { Plus, Trash2 } from "lucide-react";

interface Props {
  customers: { id: string; companyName: string; number: string }[];
  contacts: { id: string; customerId: string; name: string }[];
  opportunities: { id: string; customerId: string; number: string; name: string }[];
  salesUsers: { id: string; name: string }[];
  /** Any active user can sign a quotation's PDF, not just Sales — e.g. a
   * Director signs high-value quotes. Defaults to Sales PIC if left blank. */
  signerUsers: { id: string; name: string; title: string | null }[];
  /** Pre-fill Customer/Contact/Opportunity, e.g. when arriving from that
   * Opportunity's own "5. Quotation" folder — still editable, just saves a
   * lookup. */
  defaultValues?: Partial<QuotationInput>;
  /** Edit mode: when set, submitting updates this existing DRAFT quotation
   * instead of creating a new one — used both by the plain "Edit" link on a
   * quotation and by the Costing -> Quotation conversion flow (spec: the
   * carried-over quotation must land somewhere the PIC can review/adjust
   * everything, including Commercial Provisions, before submitting). */
  quotationId?: string;
}

export function QuotationForm({ customers, contacts, opportunities, salesUsers, signerUsers, defaultValues, quotationId }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const { register, control, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm<QuotationInput>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      quotationDate: new Date(),
      discount: 0,
      items: [{ itemName: "", quantity: 1, unit: "unit", unitPrice: 0, discountPercent: 0, taxPercent: 11 }],
      commercialTerms: DEFAULT_COMMERCIAL_TERMS,
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const { fields: termFields } = useFieldArray({ control, name: "commercialTerms" });
  const watchedItems = watch("items");
  const watchedDiscount = watch("discount");
  const watchedCustomerId = watch("customerId");

  const totals = useMemo(() => calcQuotationTotals(watchedItems || [], Number(watchedDiscount || 0)), [watchedItems, watchedDiscount]);
  const filteredContacts = contacts.filter((c) => c.customerId === watchedCustomerId);
  const filteredOpportunities = opportunities.filter((o) => o.customerId === watchedCustomerId);

  async function onSubmit(data: QuotationInput) {
    const res = quotationId ? await updateQuotationAction(quotationId, data) : await createQuotationAction(data);
    if (res.ok) {
      toast({ title: quotationId ? "Quotation updated" : "Quotation created", variant: "success" });
      router.push(`/sales/quotations/${res.data.id}`);
    } else {
      toast({ title: "Unable to save quotation", description: res.error, variant: "destructive" });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Customer</Label>
          <Select {...register("customerId")} defaultValue="">
            <option value="" disabled>Select customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
          </Select>
          {errors.customerId && <p className="text-xs text-destructive">{errors.customerId.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Contact</Label>
          <Select {...register("contactId")} defaultValue="">
            <option value="">None</option>
            {filteredContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Opportunity</Label>
          <Select {...register("opportunityId")} defaultValue="">
            <option value="">None</option>
            {filteredOpportunities.map((o) => <option key={o.id} value={o.id}>{o.number} — {o.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Sales PIC</Label>
          <Select {...register("salesPicId")} defaultValue="">
            <option value="" disabled>Select</option>
            {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          {errors.salesPicId && <p className="text-xs text-destructive">{errors.salesPicId.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Signer (PDF name/title/signature)</Label>
          <Select {...register("signerId")} defaultValue="">
            <option value="">Same as Sales PIC</option>
            {signerUsers.map((u) => <option key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ""}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Quotation Date</Label>
          <Controller control={control} name="quotationDate" render={({ field }) => (
            <Input type="date" value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""} onChange={(e) => field.onChange(new Date(e.target.value))} />
          )} />
        </div>
        <div className="space-y-1">
          <Label>Valid Until</Label>
          <Controller control={control} name="validUntil" render={({ field }) => (
            <Input type="date" value={field.value ? new Date(field.value as unknown as string).toISOString().slice(0, 10) : ""} onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)} />
          )} />
        </div>
        <div className="col-span-2 space-y-1 md:col-span-3">
          <Label>PDF Subject Line <span className="text-muted-foreground">(e.g. &quot;Quotation — Bracket Idler for Mechanical Parts&quot;)</span></Label>
          <Input {...register("subjectLine")} />
        </div>
        <div className="col-span-2 space-y-1 md:col-span-3">
          <Label>Description</Label>
          <Textarea rows={2} {...register("description")} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-1">
          <Label>Commercial Provisions</Label>
          <p className="text-xs text-muted-foreground">
            Isi enam poin ini persis seperti yang akan tercetak di halaman 2 Quotation PDF (Price, Validity, Lead Time,
            Scope of Work, Payment Terms, Warranty). Sudah diisi dengan teks standar — ubah sesuai kebutuhan quotation ini.
          </p>
        </div>
        <div className="mt-3 space-y-3">
          {termFields.map((field, idx) => (
            <div key={field.id} className="grid grid-cols-1 gap-2 rounded-md border border-border/60 p-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{String(idx + 1).padStart(2, "0")} — Judul</Label>
                <Input {...register(`commercialTerms.${idx}.title`)} />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs text-muted-foreground">Isi</Label>
                <Textarea rows={2} {...register(`commercialTerms.${idx}.body`)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <Label>Quotation Items</Label>
          <Button type="button" size="sm" variant="outline" onClick={() => append({ itemName: "", quantity: 1, unit: "unit", unitPrice: 0, discountPercent: 0, taxPercent: 11 })}>
            <Plus className="h-3.5 w-3.5" /> Add Item
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Disc %</TableHead>
              <TableHead>Tax %</TableHead>
              <TableHead>Total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, idx) => (
              <TableRow key={field.id}>
                <TableCell className="min-w-[180px]"><Input {...register(`items.${idx}.itemName`)} /></TableCell>
                <TableCell className="w-20"><Input type="number" step="any" {...register(`items.${idx}.quantity`)} /></TableCell>
                <TableCell className="w-20"><Input {...register(`items.${idx}.unit`)} /></TableCell>
                <TableCell className="w-32"><Input type="number" step="any" {...register(`items.${idx}.unitPrice`)} /></TableCell>
                <TableCell className="w-20"><Input type="number" step="any" {...register(`items.${idx}.discountPercent`)} /></TableCell>
                <TableCell className="w-20"><Input type="number" step="any" {...register(`items.${idx}.taxPercent`)} /></TableCell>
                <TableCell className="w-32 text-sm">{formatCurrency(totals.lineTotals[idx] ?? 0)}</TableCell>
                <TableCell>
                  <Button type="button" size="icon" variant="ghost" onClick={() => remove(idx)} disabled={fields.length === 1}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {errors.items && <p className="mt-1 text-xs text-destructive">{errors.items.message as string}</p>}

        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Discount</span>
            <Input type="number" step="any" className="h-7 w-28 text-right" {...register("discount")} />
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(totals.tax)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Grand Total</span><span>{formatCurrency(totals.grandTotal)}</span></div>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea rows={2} {...register("notes")} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : quotationId ? "Save Changes" : "Save as Draft"}
        </Button>
      </div>
    </form>
  );
}
