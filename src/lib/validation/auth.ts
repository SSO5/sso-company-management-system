import { z } from "zod";

// Email is normalized (trimmed + lowercased) before it ever reaches the
// database lookup. Mobile keyboards auto-capitalize the first letter, and
// people copy addresses with trailing spaces — without this, a perfectly
// correct password still returns "Invalid email or password" because the
// exact-match lookup never finds the row. See loginAction, which also does
// a case-insensitive query as a second line of defense for rows that were
// stored with mixed case before this normalization existed.
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Suggested "jabatan" values for the PDF signature block (Director signs
// high-value quotes, Marketing Manager / Procurement / Finance Manager cover
// the other common signers). Offered as quick-pick suggestions rather than a
// locked enum — existing users already carry freeform titles like "Sales
// Manager" / "Sales Engineer" from real seed data, so the field stays a text
// input with a datalist instead of a strict dropdown.
export const TITLE_OPTIONS = [
  "Direktur Utama",
  "CFO & COO",
  "General Manager",
  "Direktur",
  "Sales Engineer",
  "Marketing Manager",
  "Procurement",
  "Finance Manager",
] as const;

// WhatsApp number for outbound notifications (see lib/notifications/whatsapp.ts)
// — accepts common human-entered formats ("0812...", "+62812...", "62812...")
// and normalizes to Fonnte's expected international-no-plus format.
const whatsappNumberSchema = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return null;
    if (digits.startsWith("0")) return `62${digits.slice(1)}`;
    return digits;
  })
  .refine((v) => v === null || (v.length >= 9 && v.length <= 15), {
    message: "Enter a valid WhatsApp number (e.g. 0812xxxxxxx or +62812xxxxxxx).",
  });

export const createUserSchema = z.object({
  name: z.string().min(2, "Name is required."),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["ADMIN", "SALES", "FINANCE", "PROJECT_MANAGER", "VIEWER", "IT"]),
  title: z.string().optional().nullable(),
  whatsappNumber: whatsappNumberSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, "Name is required."),
  email: z.string().email(),
  role: z.enum(["ADMIN", "SALES", "FINANCE", "PROJECT_MANAGER", "VIEWER", "IT"]),
  title: z.string().optional().nullable(),
  whatsappNumber: whatsappNumberSchema,
  isActive: z.coerce.boolean().default(true),
  password: z.string().min(8, "Password must be at least 8 characters.").optional().or(z.literal("")),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
