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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { vendorPurchaseOrderSchema, type VendorPurchaseOrderInput } from "@/lib/validation/sales";
import { calcVendorPoTotals } from "@/lib/workflows/calculations";
import { formatCurrency } from "@/lib/utils";
import { createVendorPurchaseOrderAction } from "@/server/sales/vendor-purchase-orders";
import { Plus, Trash2 } from "lucide-react";

interface Props {
  customers: { id: string; companyName: string; number: string }[];
  projects: { id: string; number: string }[];
  users: { id: string; name: string }[];
}

function dateInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function VendorPoForm({ customers, projects, users }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const { register, control, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm<VendorPurchaseOrderInput>({
    resolver: zodResolver(vendorPurchaseOrderSchema),
    defaultValues: {
      poDate: new Date(),
      discount: 0,
      taxPercent: 11,
      items: [{ groupLabel: "", description: "", quantity: 1, unit: "lot", unitPrice: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchedItems = watch("items");
  const watchedDiscount = watch("discount");
  const watchedTaxPercent = watch("taxPercent");
  const totals = useMemo(
    () => calcVendorPoTotals(watchedItems || [], Number(watchedDiscount || 0), Number(watchedTaxPercent || 0)),
    [watchedItems, watchedDiscount, watchedTaxPercent]
  );

  async function onSubmit(data: VendorPurchaseOrderInput) {
    const res = await createVendorPurchaseOrderAction(data);
    if (res.ok) {
      toast({ title: "Vendor PO created", variant: "success" });
      router.push(`/procurement/vendor-po/${res.data.id}`);
    } else {
      toast({ title: "Unable to save PO", description: res.error, variant: "destructive" });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Vendor (TO)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label>Vendor Name</Label>
            <Input {...register("vendorName")} placeholder="PT ATHENA TEKNIK PERKASA" />
            {errors.vendorName && <p className="text-xs text-destructive">{errors.vendorName.message}</p>}
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Vendor Address</Label>
            <Input {...register("vendorAddress")} />
          </div>
          <div className="space-y-1">
            <Label>Vendor Email</Label>
            <Input {...register("vendorEmail")} type="email" />
          </div>
          <div className="space-y-1">
            <Label>Vendor Attn</Label>
            <Input {...register("vendorAttn")} placeholder="Bp. Kodrat AS (0813...)" />
          </div>
          <div className="space-y-1">
            <Label>PO Date</Label>
            <Controller control={control} name="poDate" render={({ field }) => (
              <Input type="date" value={dateInputValue(field.value)} onChange={(e) => field.onChange(new Date(e.target.value))} />
            )} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Delivery Address</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label>Delivery To (name)</Label>
            <Input {...register("deliveryName")} placeholder="PT JAKARTA PRIMA CRANES" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Delivery Address</Label>
            <Input {...register("deliveryAddress")} />
          </div>
          <div className="space-y-1">
            <Label>Delivery Attn</Label>
            <Input {...register("deliveryAttn")} />
          </div>
          <div className="space-y-1">
            <Label>Linked Customer (optional)</Label>
            <Select {...register("customerId")} defaultValue="">
              <option value="">None</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Linked Project (optional)</Label>
            <Select {...register("projectId")} defaultValue="">
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>References &amp; Terms</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Quotation Ref. (vendor&apos;s own quote no.)</Label>
            <Input {...register("quotationRef")} placeholder="ATP26-VII/Ext/12" />
          </div>
          <div className="space-y-1">
            <Label>Project Ref.</Label>
            <Input {...register("projectRef")} placeholder="2026/BPN-L-0505" />
          </div>
          <div className="space-y-1">
            <Label>Payment Terms</Label>
            <Input {...register("paymentTerms")} placeholder="30% DP Setelah PO, 70% Setelah pekerjaan selesai" />
          </div>
          <div className="space-y-1">
            <Label>Delivery Terms</Label>
            <Input {...register("deliveryTerms")} placeholder="3 minggu setelah PO diterima" />
          </div>
          <div className="space-y-1">
            <Label>Signer (Authorized by SSO)</Label>
            <Select {...register("signerId")} defaultValue="">
              <option value="">Me (default)</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Fill &quot;Group&quot; to start a bold numbered section (e.g. &quot;MOTOR 55 KW 75 HP&quot;) — leave blank on later rows in the same
            group to keep them grouped under the last heading.
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={() => append({ groupLabel: "", description: "", quantity: 1, unit: "lot", unitPrice: 0 })}>
              <Plus className="h-3.5 w-3.5" /> Add Item
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Group</TableHead><TableHead>Description</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>Unit Price</TableHead><TableHead>Amount</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, idx) => (
                <TableRow key={field.id}>
                  <TableCell className="min-w-[140px]"><Input {...register(`items.${idx}.groupLabel`)} placeholder="MOTOR 55 KW 75 HP" /></TableCell>
                  <TableCell className="min-w-[200px]"><Input {...register(`items.${idx}.description`)} /></TableCell>
                  <TableCell className="w-20"><Input type="number" step="any" {...register(`items.${idx}.quantity`)} /></TableCell>
                  <TableCell className="w-20"><Input {...register(`items.${idx}.unit`)} /></TableCell>
                  <TableCell className="w-32"><Input type="number" step="any" {...register(`items.${idx}.unitPrice`)} /></TableCell>
                  <TableCell className="w-32 text-sm">{formatCurrency(totals.lineTotals[idx] ?? 0)}</TableCell>
                  <TableCell><Button type="button" size="icon" variant="ghost" onClick={() => remove(idx)} disabled={fields.length === 1}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span>{formatCurrency(totals.subtotal)}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Discount</span><Input type="number" step="any" className="h-7 w-28 text-right" {...register("discount")} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Netto</span><span>{formatCurrency(totals.netto)}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Tax %</span><Input type="number" step="any" className="h-7 w-28 text-right" {...register("taxPercent")} /></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>TOTAL AMOUNT</span><span>{formatCurrency(totals.grandTotal)}</span></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Note / Ketentuan</CardTitle></CardHeader>
        <CardContent>
          <Textarea {...register("notes")} rows={3} placeholder={"1. Biaya diatas sudah termasuk PPN 11%\n2. Jika dalam 1 hari kerja tidak ada konfirmasi, kami anggap vendor menyetujui seluruh syarat & ketentuan PO ini."} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Create Vendor PO"}</Button>
      </div>
    </form>
  );
}
