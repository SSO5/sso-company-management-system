import { z } from "zod";

/**
 * Costing sheet input (spec: dynamic sections + line items, usable from a
 * phone — PIC just types name/qty/cost/margin per line, everything else is
 * computed). Mirrors the structure of the uploaded "COSTING JPC - GEARBOX"
 * reference: grouped sections (e.g. "Material", "Fabrication", "Services"),
 * each with any number of line items, each line item free-form since scope
 * of goods/services supplied is highly dynamic.
 */
export const costingLineItemSchema = z.object({
  id: z.string().optional(), // present when editing an existing line
  groupLabel: z.string().optional().nullable(),
  name: z.string().min(1, "Item name is required."),
  description: z.string().optional().nullable(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0.").default(1),
  unit: z.string().default("lot"),
  currency: z.string().default("IDR"),
  costUnitPrice: z.coerce.number().nonnegative("Cost must be 0 or more."),
  supplierDiscountPercent: z.coerce.number().min(0).max(100).default(0),
  marginPercent: z.coerce.number().min(0).max(99.99, "Margin must be less than 100%.").default(0),
});
export type CostingLineItemInput = z.infer<typeof costingLineItemSchema>;

export const costingSectionSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1, "Section code is required."),
  name: z.string().min(1, "Section name is required."),
  items: z.array(costingLineItemSchema).min(1, "Add at least one line item."),
});
export type CostingSectionInput = z.infer<typeof costingSectionSchema>;

export const costingSheetSchema = z.object({
  customerId: z.string().min(1, "Customer is required."),
  opportunityId: z.string().optional().nullable(),
  projectTitle: z.string().min(2, "Project / job title is required."),
  jobNo: z.string().optional().nullable(),
  costingDate: z.coerce.date(),
  notes: z.string().optional().nullable(),
  // Profitability summary inputs (spec: matches SSO's real costing SOP —
  // PPN/PPh Final are % of Total COGS, operational is a flat manual estimate).
  operationalCost: z.coerce.number().nonnegative().default(0),
  ppnPercent: z.coerce.number().min(0).max(100).default(11),
  pphFinalPercent: z.coerce.number().min(0).max(100).default(2),
  sections: z.array(costingSectionSchema).min(1, "Add at least one section."),
});
export type CostingSheetInput = z.infer<typeof costingSheetSchema>;

/** Default section template — PIC can rename, delete, add more freely. */
export const DEFAULT_COSTING_SECTIONS: CostingSectionInput[] = [
  { code: "MAT", name: "Material", items: [{ name: "", quantity: 1, unit: "pcs", currency: "IDR", costUnitPrice: 0, supplierDiscountPercent: 0, marginPercent: 35 }] },
  { code: "FAB", name: "Fabrication / Labor", items: [{ name: "", quantity: 1, unit: "lot", currency: "IDR", costUnitPrice: 0, supplierDiscountPercent: 0, marginPercent: 35 }] },
  { code: "OTH", name: "Other (Transport, Vendor, Misc.)", items: [{ name: "", quantity: 1, unit: "lot", currency: "IDR", costUnitPrice: 0, supplierDiscountPercent: 0, marginPercent: 35 }] },
];
