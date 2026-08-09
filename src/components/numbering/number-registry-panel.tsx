"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import {
  numberRegistrySchema, quotationIntakeSchema, DOCUMENT_TYPE_CODES, DEPARTMENT_CODES,
  type NumberRegistryInput, type QuotationIntakeInput,
} from "@/lib/validation/numbering";
import { createNumberRegistryEntryAction, voidNumberRegistryEntryAction, createQuotationIntakeAction } from "@/server/numbering/registry";
import { Copy, Plus, X } from "lucide-react";

interface Entry {
  id: string;
  docTypeCode: string;
  deptCode: string;
  number: string;
  numberDate: Date | string;
  subject: string;
  picName: string;
  createdBy: { name: string };
  voidedAt: Date | string | null;
}

/**
 * "Ambil Nomor" — grab a document number before drafting the actual
 * document (matches SSO's real workflow: number first, document second).
 * Special-cased for QUO: instead of just reserving a bare number, it
 * captures Customer + Contact (name/HP/email) and creates the real
 * Customer/Contact/Opportunity records right away. It does NOT jump
 * straight into the Quotation form — the user opens the Opportunity (and
 * its "4. Quotation" folder) themselves whenever they're ready; that's
 * where the actual QUO number gets issued once items are added. Every
 * other document type keeps the plain number-registry form.
 */
export function NumberRegistryPanel({ entries }: { entries: Entry[] }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [localEntries, setLocalEntries] = useState(entries);
  const [lastNumber, setLastNumber] = useState<string | null>(null);
  const [lastOpportunity, setLastOpportunity] = useState<{ id: string; number: string; customerName: string } | null>(null);
  const [docTypeCode, setDocTypeCode] = useState("QUO");
  const isQuotation = docTypeCode === "QUO";

  const generic = useForm<NumberRegistryInput>({
    resolver: zodResolver(numberRegistrySchema),
    defaultValues: { docTypeCode: "QUO", deptCode: "MKT", numberDate: new Date(), subject: "", picName: "" },
  });

  const quo = useForm<QuotationIntakeInput>({
    resolver: zodResolver(quotationIntakeSchema),
    defaultValues: { numberDate: new Date(), subject: "", customerName: "", contactName: "", contactPhone: "", contactEmail: "" },
  });

  async function onSubmitGeneric(data: NumberRegistryInput) {
    const res = await createNumberRegistryEntryAction({ ...data, docTypeCode });
    if (res.ok) {
      setLastNumber(res.data.number);
      toast({ title: `Nomor ${res.data.number} berhasil dibuat`, variant: "success" });
      generic.reset({ docTypeCode, deptCode: data.deptCode, numberDate: new Date(), subject: "", picName: "" });
      // Optimistic prepend; revalidatePath will reconcile on next navigation.
      setLocalEntries((prev) => [
        { id: res.data.id, docTypeCode, deptCode: data.deptCode, number: res.data.number, numberDate: data.numberDate, subject: data.subject, picName: data.picName, createdBy: { name: "You" }, voidedAt: null },
        ...prev,
      ]);
    } else {
      toast({ title: "Gagal membuat nomor", description: res.error, variant: "destructive" });
    }
  }

  async function onSubmitQuotation(data: QuotationIntakeInput) {
    const res = await createQuotationIntakeAction(data);
    if (res.ok) {
      toast({ title: `Opportunity ${res.data.opportunityNumber} dibuat`, description: `Customer & Contact untuk ${res.data.customerName} sudah tersimpan.`, variant: "success" });
      setLastOpportunity({ id: res.data.opportunityId, number: res.data.opportunityNumber, customerName: res.data.customerName });
      quo.reset({ numberDate: new Date(), subject: "", customerName: "", contactName: "", contactPhone: "", contactEmail: "" });
    } else {
      toast({ title: "Gagal membuat Opportunity", description: res.error, variant: "destructive" });
    }
  }

  async function onVoid(id: string) {
    const res = await voidNumberRegistryEntryAction(id);
    if (res.ok) {
      setLocalEntries((prev) => prev.map((e) => (e.id === id ? { ...e, voidedAt: new Date() } : e)));
      toast({ title: "Nomor dibatalkan", variant: "success" });
    } else {
      toast({ title: "Gagal membatalkan", description: res.error, variant: "destructive" });
    }
  }

  function onCopy(number: string) {
    navigator.clipboard.writeText(number);
    toast({ title: "Nomor disalin ke clipboard" });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return localEntries;
    return localEntries.filter((e) => e.number.toLowerCase().includes(q) || e.subject.toLowerCase().includes(q));
  }, [localEntries, search]);

  return (
    <div className="space-y-4">
      <Card className="border-l-4 border-l-primary">
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base"><Plus className="h-4 w-4" /> Ambil Nomor Baru</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Jenis Dokumen</Label>
              <Select
                value={docTypeCode}
                onChange={(e) => {
                  setDocTypeCode(e.target.value);
                  generic.setValue("docTypeCode", e.target.value);
                }}
              >
                {DOCUMENT_TYPE_CODES.map((t) => <option key={t.code} value={t.code}>{t.label} ({t.code})</option>)}
              </Select>
            </div>
            {!isQuotation && (
              <div className="space-y-1">
                <Label>Divisi / Departemen</Label>
                <Select {...generic.register("deptCode")}>
                  {DEPARTMENT_CODES.map((d) => <option key={d.code} value={d.code}>{d.label} ({d.code})</option>)}
                </Select>
                {generic.formState.errors.deptCode && <p className="text-xs text-destructive">{generic.formState.errors.deptCode.message}</p>}
              </div>
            )}
          </div>

          {isQuotation ? (
            <form onSubmit={quo.handleSubmit(onSubmitQuotation)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Generate Nomor otomatis membuat Customer, Contact, dan kartu Opportunity. Nomor QUO sendiri belum diterbitkan di sini — buka Opportunity-nya kapan pun Anda siap, lalu buat quotation dari folder &quot;4. Quotation&quot; di dalamnya.
              </p>
              <div className="space-y-1">
                <Label>Tanggal</Label>
                <Controller control={quo.control} name="numberDate" render={({ field }) => (
                  <Input type="date" value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""} onChange={(e) => field.onChange(new Date(e.target.value))} />
                )} />
              </div>
              <div className="space-y-1">
                <Label>Nama Perusahaan (Customer)</Label>
                <Input placeholder="Contoh: PT Jakarta Prima Cranes" {...quo.register("customerName")} />
                {quo.formState.errors.customerName && <p className="text-xs text-destructive">{quo.formState.errors.customerName.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Nama Kontak / PIC Customer</Label>
                <Input placeholder="Nama PIC di perusahaan customer" {...quo.register("contactName")} />
              </div>
              <div className="space-y-1">
                <Label>No. HP Kontak</Label>
                <Input placeholder="08xx..." {...quo.register("contactPhone")} />
              </div>
              <div className="space-y-1">
                <Label>Email Kontak</Label>
                <Input type="email" placeholder="nama@perusahaan.com" {...quo.register("contactEmail")} />
                {quo.formState.errors.contactEmail && <p className="text-xs text-destructive">{quo.formState.errors.contactEmail.message}</p>}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Perihal / Nama Proyek</Label>
                <Input placeholder="Contoh: Penawaran Fabrikasi Frame Roller" {...quo.register("subject")} />
                {quo.formState.errors.subject && <p className="text-xs text-destructive">{quo.formState.errors.subject.message}</p>}
              </div>
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                {lastOpportunity && (
                  <p className="text-sm">
                    Opportunity terakhir: <span className="font-mono font-semibold">{lastOpportunity.number}</span> ({lastOpportunity.customerName}) —{" "}
                    <Link href={`/sales/opportunities/${lastOpportunity.id}`} className="text-primary hover:underline">buka</Link>
                  </p>
                )}
                <Button type="submit" disabled={quo.formState.isSubmitting} className="ml-auto">
                  {quo.formState.isSubmitting ? "Membuat..." : "Generate Nomor"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={generic.handleSubmit(onSubmitGeneric)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Tanggal</Label>
                <Controller control={generic.control} name="numberDate" render={({ field }) => (
                  <Input type="date" value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""} onChange={(e) => field.onChange(new Date(e.target.value))} />
                )} />
              </div>
              <div className="space-y-1">
                <Label>Nama Peminta (PIC)</Label>
                <Input placeholder="Nama Lengkap Anda" {...generic.register("picName")} />
                {generic.formState.errors.picName && <p className="text-xs text-destructive">{generic.formState.errors.picName.message}</p>}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Perihal / Nama Proyek (Untuk Tracking)</Label>
                <Input placeholder="Contoh: Penawaran Harga Termin 1" {...generic.register("subject")} />
                {generic.formState.errors.subject && <p className="text-xs text-destructive">{generic.formState.errors.subject.message}</p>}
              </div>
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                {lastNumber && <p className="text-sm">Nomor terakhir: <span className="font-mono font-semibold">{lastNumber}</span></p>}
                <Button type="submit" disabled={generic.formState.isSubmitting} className="ml-auto">{generic.formState.isSubmitting ? "Membuat..." : "Generate Nomor"}</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Riwayat Registrasi Nomor Dokumen</CardTitle>
          <Input placeholder="Cari nomor atau perihal..." className="h-8 max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-4"><EmptyState title="Belum ada nomor yang diambil" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor Registrasi</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Perihal</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Divisi</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id} className={e.voidedAt ? "opacity-50" : undefined}>
                    <TableCell className="font-mono text-xs font-semibold">{e.number}{e.voidedAt && <span className="ml-1 text-[10px] font-normal text-destructive">(dibatalkan)</span>}</TableCell>
                    <TableCell className="text-sm">{formatDate(e.numberDate)}</TableCell>
                    <TableCell className="text-sm">{e.subject}</TableCell>
                    <TableCell className="text-sm">{e.picName}</TableCell>
                    <TableCell><Badge variant="outline">{e.docTypeCode}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{e.deptCode}</Badge></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="icon" variant="ghost" onClick={() => onCopy(e.number)} title="Salin nomor"><Copy className="h-3.5 w-3.5" /></Button>
                        {!e.voidedAt && (
                          <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => onVoid(e.id)} title="Batalkan"><X className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
