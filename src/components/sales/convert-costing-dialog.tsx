"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { convertCostingToQuotationAction } from "@/server/sales/costing";

interface Props {
  costingId: string;
  users: { id: string; name: string; title: string | null }[];
  contacts: { id: string; name: string }[];
  defaultSalesPicId?: string;
}

/**
 * Turns a costing sheet into a quotation without re-typing anything. Also
 * where "customizable PIC/TTD" becomes concrete: Sales PIC and Signer are
 * two independent choices — any active user, not a fixed company default —
 * because the person who owns the deal and the person who signs the PDF
 * (e.g. a Director for high-value quotes) aren't always the same.
 */
export function ConvertCostingDialog({ costingId, users, contacts, defaultSalesPicId }: Props) {
  const [open, setOpen] = useState(false);
  const [salesPicId, setSalesPicId] = useState(defaultSalesPicId || "");
  const [signerId, setSignerId] = useState(defaultSalesPicId || "");
  const [contactId, setContactId] = useState("");
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function onConfirm() {
    if (!salesPicId) {
      toast({ title: "Select a Sales PIC first", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const res = await convertCostingToQuotationAction(costingId, { salesPicId, signerId: signerId || undefined, contactId: contactId || undefined });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: "Quotation created from costing sheet — review it before submitting", variant: "success" });
      setOpen(false);
      // Land on the editable form (not the read-only detail page) so the PIC
      // sees and can adjust everything — subject line, valid-until, and the
      // Commercial Provisions terms grid — before submitting for approval.
      router.push(`/sales/quotations/${res.data.quotationId}/edit`);
    } else {
      toast({ title: "Unable to convert", description: res.error, variant: "destructive" });
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Convert to Quotation</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Convert to Quotation"
        description="Every line item and selling price carries over — nothing needs retyping. Pick who owns the deal and who signs the PDF."
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Sales PIC</Label>
            <Select value={salesPicId} onChange={(e) => setSalesPicId(e.target.value)}>
              <option value="" disabled>Select</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ""}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Signer (name/title/signature on PDF)</Label>
            <Select value={signerId} onChange={(e) => setSignerId(e.target.value)}>
              <option value="">Same as Sales PIC</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ""}</option>)}
            </Select>
          </div>
          {contacts.length > 0 && (
            <div className="space-y-1">
              <Label>Customer Contact</Label>
              <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">None</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={onConfirm} disabled={submitting}>{submitting ? "Converting..." : "Create Quotation"}</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
