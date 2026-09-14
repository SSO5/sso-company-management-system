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
      toast({ title: "Draf invoice berhasil dibuat", variant: "success" });
      router.push(`/finance/invoices/${res.data.id}`);
    } else {
      toast({ title: "Invoice belum dapat disimpan", description: res.error, variant: "destructive" });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
        <div className="space-y-1">
          <Label>Pelanggan</Label>
          <Select {...register("customerId")} defaultValue="">
            <option value="" disabled>Pilih pelanggan</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.companyName}</option>)}
          </Select>
          {errors.customerId && <p className="text-xs text-destructive">{errors.customerId.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Kontak tujuan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
          <Select {...register("contactId")} defaultValue="">
            <option value="">Belum ditentukan</option>
            {filteredContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Proyek <span className="font-normal text-muted-foreground">(opsional)</span></Label>
          <Select {...register("projectId")} defaultValue="">
            <option value="">Tidak terkait proyek</option>
            {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>PIC penjualan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
          <Select {...register("salesPicId")} defaultValue="">
            <option value="">Belum ditentukan</option>
            {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Tanggal invoice</Label>
          <Controller control={control} name="invoiceDate" render={({ field }) => (
            <Input type="date" value={dateInputValue(field.value)} onChange={(e) => field.onChange(new Date(e.target.value))} />
          )} />
        </div>
        <div className="space-y-1">
          <Label>Jatuh tempo</Label>
          <Controller control={control} name="dueDate" render={({ field }) => (
            <Input type="date" value={dateInputValue(field.value)} onChange={(e) => field.onChange(new Date(e.target.value))} />
          )} />
        </div>
        <div className="space-y-1">
          <Label>Nomor PO pelanggan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
          <Input {...register("customerPO")} placeholder="EPC-L/2026-0450" />
        </div>
        <div className="space-y-1">
          <Label>Tanggal PO <span className="font-normal text-muted-foreground">(opsional)</span></Label>
          <Controller control={control} name="poDate" render={({ field }) => (
            <Input type="date" value={dateInputValue(field.value)} onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)} />
          )} />
        </div>
        <div className="space-y-1">
          <Label>Tanggal penyerahan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
          <Controller control={control} name="deliveryDate" render={({ field }) => (
            <Input type="date" value={dateInputValue(field.value)} onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)} />
          )} />
        </div>
        <div className="space-y-1">
          <Label>Nomor pekerjaan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
          <Input {...register("jobNo")} placeholder="JO-2607-003" />
        </div>
        <div className="space-y-1">
          <Label>Persentase uang muka <span className="font-normal text-muted-foreground">(opsional)</span></Label>
          <Input type="number" step="any" min={0} max={100} {...register("dpPercent")} placeholder="Contoh: 20" />
          <p className="text-[11px] text-muted-foreground">Kosongkan apabila invoice menagihkan nilai penuh.</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <Label>Rincian tagihan</Label>
            <p className="text-[11px] text-muted-foreground">
              Isi kelompok pada baris pertama pekerjaan. Baris berikutnya boleh dikosongkan agar tetap berada dalam kelompok yang sama. Gunakan “catatan saja” untuk lingkup tanpa harga.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => append({ groupLabel: "", description: "", quantity: 1, unit: "unit", unitPrice: 0, taxPercent: 11, isNote: false })}>
            <Plus className="h-3.5 w-3.5" /> Tambah rincian
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Kelompok</TableHead><TableHead>Uraian</TableHead><TableHead>Jumlah</TableHead><TableHead>Satuan</TableHead><TableHead>Harga satuan</TableHead><TableHead>Pajak %</TableHead><TableHead>Catatan saja</TableHead><TableHead>Total</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, idx) => {
              const isNote = watchedItems?.[idx]?.isNote;
              return (
                <TableRow key={field.id}>
                  <TableCell className="min-w-[140px]"><Input {...register(`items.${idx}.groupLabel`)} placeholder="Kosongkan jika sama" /></TableCell>
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
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Potongan</span><Input type="number" step="any" className="h-7 w-28 text-right" {...register("discount")} /></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Pajak</span><span>{formatCurrency(totals.tax)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total tagihan</span><span>{formatCurrency(totals.grandTotal)}</span></div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <Label>Catatan invoice <span className="font-normal text-muted-foreground">(opsional, tercetak pada PDF)</span></Label>
        <Textarea {...register("notes")} rows={4} placeholder={"1. Harga sudah termasuk:\n   a. ...\n2. Semua sparepart yang diganti..."} className="mt-1" />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Batal</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Menyimpan…" : "Simpan sebagai draf"}</Button>
      </div>
    </form>
  );
}
