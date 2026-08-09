import { z } from "zod";

/**
 * "Ambil Nomor" intake form (spec: grab a number FIRST, before drafting the
 * actual document). Document type and department are SSO's real internal
 * code lists — plain data, not Prisma enums, so adding a new type/dept
 * later is a one-line change here, not a schema migration.
 */
export const DOCUMENT_TYPE_CODES = [
  { code: "SK", label: "Surat Keluar Resmi" },
  { code: "SKEP", label: "Surat Keputusan (Decree)" },
  { code: "IM", label: "Internal Memo" },
  { code: "ST", label: "Surat Tugas / Perintah Kerja" },
  { code: "QUO", label: "Surat Penawaran (Quotation)" },
  { code: "INV", label: "Invoice Penagihan" },
  { code: "KUI", label: "Kuitansi / Bukti Bayar" },
  { code: "PO", label: "Purchase Order" },
  { code: "WO", label: "Work Order" },
  { code: "BAST", label: "Berita Acara Serah Terima" },
  { code: "BAP", label: "Berita Acara Pembayaran" },
  { code: "PKS", label: "Perjanjian Kerja Sama (PKS)" },
  { code: "MOU", label: "Nota Kesepahaman (MoU)" },
] as const;

export const DEPARTMENT_CODES = [
  { code: "DIR", label: "Direksi / Management" },
  { code: "HR-GA", label: "Human Resources & General Affairs" },
  { code: "FIN", label: "Finance & Tax" },
  { code: "ACC", label: "Accounting" },
  { code: "ENG", label: "Engineering & Operational" },
  { code: "PRO", label: "Procurement & Logistic" },
  { code: "MKT", label: "Marketing & Business Development" },
  { code: "LGL", label: "Legal & Corporate Secretary" },
  { code: "PMO", label: "Project Management Office" },
] as const;

export const numberRegistrySchema = z.object({
  docTypeCode: z.string().refine((v) => DOCUMENT_TYPE_CODES.some((d) => d.code === v), "Pilih jenis dokumen."),
  deptCode: z.string().refine((v) => DEPARTMENT_CODES.some((d) => d.code === v), "Pilih departemen."),
  numberDate: z.coerce.date(),
  subject: z.string().min(2, "Perihal wajib diisi."),
  picName: z.string().min(2, "Nama PIC wajib diisi."),
});
export type NumberRegistryInput = z.infer<typeof numberRegistrySchema>;

/**
 * "Ambil Nomor" for a Quotation specifically is a shortcut into the real
 * Sales pipeline, not just a document-number reservation (spec: PIC
 * Customer + HP + Email captured here should auto-fill Customer, Contact,
 * and (once items are added) the Quotation itself). Submitting this creates
 * a real Customer (find-or-create by company name), Contact (find-or-create
 * by name under that customer), and Opportunity + its folders — the actual
 * QUO number is issued moments later when the quotation is saved with items
 * (see createQuotationIntake in lib/workflows/quotation-intake.ts), so no
 * number is ever burned before a real document exists behind it.
 */
export const quotationIntakeSchema = z.object({
  numberDate: z.coerce.date(),
  subject: z.string().min(2, "Perihal / nama proyek wajib diisi."),
  customerName: z.string().min(2, "Nama perusahaan customer wajib diisi."),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email("Format email tidak valid.").optional().or(z.literal("")),
});
export type QuotationIntakeInput = z.infer<typeof quotationIntakeSchema>;
