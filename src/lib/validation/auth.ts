import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Suggested "jabatan" values for the PDF signature block (Director signs
// high-value quotes, Marketing Manager / Procurement / Finance Manager cover
// the other common signers). Offered as quick-pick suggestions rather than a
// locked enum — existing users already carry freeform titles like "Sales
// Manager" / "Sales Engineer" from real seed data, so the field stays a text
// input with a datalist instead of a strict dropdown.
export const TITLE_OPTIONS = ["Director", "Marketing Manager", "Procurement", "Finance Manager"] as const;

export const createUserSchema = z.object({
  name: z.string().min(2, "Name is required."),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["ADMIN", "SALES", "FINANCE", "PROJECT_MANAGER"]),
  title: z.string().optional().nullable(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, "Name is required."),
  email: z.string().email(),
  role: z.enum(["ADMIN", "SALES", "FINANCE", "PROJECT_MANAGER"]),
  title: z.string().optional().nullable(),
  isActive: z.coerce.boolean().default(true),
  password: z.string().min(8, "Password must be at least 8 characters.").optional().or(z.literal("")),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
