"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { convertCostingToQuotationAction, convertCostingToQuotationAsRevisionAction } from "@/server/sales/costing";
import { formatRevisedNumber } from "@/lib/utils";

interface ExistingQuotation {
  id: string;
  number: string;
  revision: number;
  status: string;
}

interface Props {
  costingId: string;
  users: { id: string; name: string; title: string | null }[];
  contacts: { id: string; name: string }[];
  defaultSalesPicId?: string;
  // The deal's other still-open quotation, if any (spec 3.2: a new costing
  // sheet for a deal that already has a quotation should default to
  // becoming a revision of it, not a disconnected new one).
  existingQuotation?: ExistingQuotation | null;
}

/**
 * Turns a costing sheet into a quotation without re-typing anything. Also
 * where "customizable PIC/TTD" becomes concrete: Sales PIC and Signer are
 * two independent choices — any active user, not a fixed company default —
 * because the person who owns the deal and the person who signs the PDF
 * (e.g. a Director for high-value quotes) aren't always the same.
 */
export function ConvertCostingDialog({ costingId, users, contacts, defaultSalesPicId, existingQuotation }: Props) {
  const [open, setOpen] = useState(false);
  // When the deal already has an open quotation, start on the "ask" step
  // (spec's confirmation dialog) instead of jumping straight to the form.
  const [step, setStep] = useState<"ask" | "form">(existingQuotation ? "ask" : "form");
  const [salesPicId, setSalesPicId] = useState(defaultSalesPicId || "");
  const [signerId, setSignerId] = useState(defaultSalesPicId || "");
  const [contactId, setContactId] = useState("");
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  function resetAndClose() {
    setOpen(false);
    setStep(existingQuotation ? "ask" : "form");
  }

  async function onConfirmRevision() {
    if (!existingQuotation) return;
    setSubmitting(true);
    const res = await convertCostingToQuotationAsRevisionAction(costingId, existingQuotation.id);
    setSubmitting(false);
    if (res.ok) {
      toast({ title: `Costing menjadi revisi R${existingQuotation.revision + 1} untuk ${existingQuotation.number}`, variant: "success" });
      setOpen(false);
      router.push(`/sales/quotations/${res.data.quotationId}/edit`);
    } else {
      toast({ title: "Revisi belum dapat dibuat", description: res.error, variant: "destructive" });
    }
  }

  async function onConfirm() {
    if (!salesPicId) {
      toast({ title: "Pilih PIC penawaran terlebih dahulu", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const res = await convertCostingToQuotationAction(costingId, {
      salesPicId,
      signerId: signerId || undefined,
      contactId: contactId || undefined,
      confirmedSeparate: !!existingQuotation,
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: "Draf penawaran dibuat dari costing", description: "Periksa harga jual dan ketentuannya sebelum diajukan.", variant: "success" });
      setOpen(false);
      // Land on the editable form (not the read-only detail page) so the PIC
      // sees and can adjust everything — subject line, valid-until, and the
      // Commercial Provisions terms grid — before submitting for approval.
      router.push(`/sales/quotations/${res.data.quotationId}/edit`);
    } else {
      toast({ title: "Penawaran belum dapat dibuat", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Buat penawaran dari costing</Button>
      {step === "ask" && existingQuotation ? (
        <Dialog
          open={open}
          onOpenChange={(v) => (v ? setOpen(true) : resetAndClose())}
          title="Gunakan sebagai revisi penawaran?"
          description={`Deal ini sudah punya Quotation ${formatRevisedNumber(existingQuotation.number, existingQuotation.revision)}. Buat costing ini sebagai Revisi R${existingQuotation.revision + 1} dari quotation tersebut?`}
        >
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setStep("form")}>Buat penawaran terpisah</Button>
            <Button type="button" onClick={onConfirmRevision} disabled={submitting}>
              {submitting ? "Menyimpan..." : `Ya, Jadikan Revisi R${existingQuotation.revision + 1}`}
            </Button>
          </div>
        </Dialog>
      ) : (
        <Dialog
          open={open}
          onOpenChange={(v) => (v ? setOpen(true) : resetAndClose())}
          title="Buat penawaran dari costing"
          description="Rincian dan harga jual disalin dari costing. Tentukan PIC dan penandatangan, lalu periksa draf sebelum diajukan."
        >
          <div className="space-y-3">
            {existingQuotation && (
              <p className="rounded bg-warning/10 px-2 py-1.5 text-xs text-muted-foreground">
                Membuat quotation terpisah dari {formatRevisedNumber(existingQuotation.number, existingQuotation.revision)} yang masih terbuka pada deal ini.
              </p>
            )}
            <div className="space-y-1">
              <Label>PIC penawaran</Label>
              <Select value={salesPicId} onChange={(e) => setSalesPicId(e.target.value)}>
                <option value="" disabled>Pilih PIC</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ""}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Penandatangan PDF</Label>
              <Select value={signerId} onChange={(e) => setSignerId(e.target.value)}>
                <option value="">Sama dengan PIC penawaran</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ""}</option>)}
              </Select>
            </div>
            {contacts.length > 0 && (
              <div className="space-y-1">
                <Label>Kontak customer</Label>
                <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">Belum ditentukan</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={resetAndClose}>Batal</Button>
              <Button type="button" onClick={onConfirm} disabled={submitting}>{submitting ? "Membuat…" : "Buat draf penawaran"}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
