import { z } from "zod";

export const customerSchema = z.object({
  companyName: z.string().min(2, "Company name is required."),
  customerType: z.enum(["PROSPECT", "CUSTOMER", "PARTNER", "OTHER"]).default("PROSPECT"),
  industry: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  website: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  notes: z.string().optional().nullable(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const contactSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(2, "Contact name is required."),
  salutation: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const opportunitySchema = z.object({
  customerId: z.string().min(1, "Customer is required."),
  contactId: z.string().optional().nullable(),
  name: z.string().min(2, "Opportunity name is required."),
  description: z.string().optional().nullable(),
  estimatedValue: z.coerce.number().nonnegative(),
  probability: z.coerce.number().int().min(0).max(100),
  expectedClosingDate: z.coerce.date().optional().nullable(),
  salesPicId: z.string().min(1, "Sales PIC is required."),
  source: z.string().optional().nullable(),
  status: z
    .enum(["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"])
    .default("NEW"),
});
export type OpportunityInput = z.infer<typeof opportunitySchema>;

export const quotationItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required."),
  description: z.string().optional().nullable(),
  technicalSpec: z.string().optional().nullable(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0."),
  unit: z.string().default("unit"),
  unitPrice: z.coerce.number().nonnegative(),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
});
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;

// Structured "Commercial Provisions" grid printed on the Quotation PDF, in
// this fixed order, matching the company's SOP layout. Pre-filled with a
// standard-terms default on create (see DEFAULT_COMMERCIAL_TERMS below),
// fully editable per quotation before submission.
export const commercialTermItemSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
});
export type CommercialTermItem = z.infer<typeof commercialTermItemSchema>;

export const DEFAULT_COMMERCIAL_TERMS: CommercialTermItem[] = [
  { title: "Price", body: "Prices stated are in Indonesian Rupiah (IDR), exclusive of VAT 11%." },
  { title: "Validity", body: "This quotation is valid for 30 (thirty) calendar days from the quotation date." },
  { title: "Lead Time", body: "To be confirmed upon receipt of official Purchase Order / Work Order." },
  { title: "Scope of Work", body: "As per the item description and technical specification stated above." },
  { title: "Payment Terms", body: "50% down payment upon PO, 50% upon delivery / completion, unless otherwise agreed." },
  { title: "Warranty", body: "12 (twelve) months against manufacturing/workmanship defects from delivery date." },
];

export const quotationSchema = z.object({
  customerId: z.string().min(1, "Customer is required."),
  contactId: z.string().optional().nullable(),
  opportunityId: z.string().optional().nullable(),
  quotationDate: z.coerce.date(),
  validUntil: z.coerce.date().optional().nullable(),
  salesPicId: z.string().min(1, "Sales PIC is required."),
  // Who signs the PDF — defaults to salesPicId if omitted (see createQuotation).
  signerId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  subjectLine: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  commercialTerms: z.array(commercialTermItemSchema).optional().nullable(),
  discount: z.coerce.number().nonnegative().default(0),
  items: z.array(quotationItemSchema).min(1, "Add at least one quotation item."),
});
export type QuotationInput = z.infer<typeof quotationSchema>;

export const purchaseOrderSchema = z.object({
  customerId: z.string().min(1),
  quotationId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  poDate: z.coerce.date(),
  poValue: z.coerce.number().positive(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  status: z.enum(["PENDING", "RECEIVED", "VERIFIED", "CANCELLED"]).default("PENDING"),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const contractSchema = z.object({
  customerId: z.string().min(1),
  quotationId: z.string().optional().nullable(),
  purchaseOrderId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  contractValue: z.coerce.number().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED", "COMPLETED"]).default("DRAFT"),
  notes: z.string().optional().nullable(),
});
export type ContractInput = z.infer<typeof contractSchema>;
