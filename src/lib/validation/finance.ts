import { z } from "zod";

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().positive().default(1),
  unit: z.string().default("unit"),
  unitPrice: z.coerce.number().nonnegative(),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export const invoiceSchema = z.object({
  customerId: z.string().min(1, "Customer is required."),
  projectId: z.string().optional().nullable(),
  quotationId: z.string().optional().nullable(),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date(),
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
});
export type PaymentInput = z.infer<typeof paymentSchema>;
