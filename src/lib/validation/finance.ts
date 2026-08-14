import { z } from "zod";

export const invoiceItemSchema = z.object({
  // Shared bold section header, e.g. "1. OVERHOUL GEARBOX DODGE MAGNEGEAR
  // 100K" — several rows can carry the same label; the PDF only prints it
  // once, when it changes from the previous row (see invoice-document.tsx).
  groupLabel: z.string().optional().nullable(),
  description: z.string().min(1, "Description is required."),
  // Note-only rows (scope bullets with no price of their own, e.g. "Bearing
  // replacement (8 pcs)") carry quantity/unitPrice = 0 and isNote = true —
  // rendered as description-only text on the PDF, contribute Rp 0 to totals.
  quantity: z.coerce.number().nonnegative().default(1),
  unit: z.string().default("unit"),
  unitPrice: z.coerce.number().nonnegative().default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  isNote: z.boolean().default(false),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export const invoiceSchema = z.object({
  customerId: z.string().min(1, "Customer is required."),
  projectId: z.string().optional().nullable(),
  quotationId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  // Fields verified against a real issued invoice ("001/INV/FIN/VIII/2026")
  // — all optional so issuing an invoice is never blocked on details Sales
  // hasn't confirmed yet.
  customerPO: z.string().optional().nullable(),
  poDate: z.coerce.date().optional().nullable(),
  deliveryDate: z.coerce.date().optional().nullable(),
  jobNo: z.string().optional().nullable(),
  salesPicId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // A down-payment/termin invoice bills only this % of grandTotal — printed
  // as "TOTAL AMOUNT DUE (DP X% inc. VAT)". Leave blank for a full invoice.
  dpPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  discount: z.coerce.number().nonnegative().default(0),
  items: z.array(invoiceItemSchema).min(1, "Add at least one invoice item."),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required."),
  paymentDate: z.coerce.date(),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  method: z.enum(["BANK_TRANSFER", "CASH", "CHECK", "CREDIT_CARD", "OTHER"]).default("BANK_TRANSFER"),
  referenceNumber: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // PPh 23 (or similar) the customer withheld before sending this payment.
  // Counts toward settling the invoice (see invoiceOutstanding()) without
  // being counted as cash received.
  withholdingTax: z.coerce.number().nonnegative().default(0),
});
export type PaymentInput = z.infer<typeof paymentSchema>;
