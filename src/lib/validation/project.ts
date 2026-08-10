import { z } from "zod";

export const projectUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  jobNumber: z.string().optional().nullable(),
  projectManagerId: z.string().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  budget: z.coerce.number().nonnegative().optional(),
  status: z
    .enum(["PLANNING", "ACTIVE", "ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED", "CLOSED"])
    .optional(),
  progressPercent: z.coerce.number().int().min(0).max(100).optional(),
});
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export const taskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2, "Task title is required."),
  description: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"]).default("TODO"),
  progressPercent: z.coerce.number().int().min(0).max(100).default(0),
  notes: z.string().optional().nullable(),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const milestoneSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(2, "Milestone name is required."),
  dueDate: z.coerce.date().optional().nullable(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "DELAYED"]).default("PENDING"),
  progressPercent: z.coerce.number().int().min(0).max(100).default(0),
  // Kontribusi milestone ini ke total scope project, untuk Kurva S.
  weightPercent: z.coerce.number().min(0).max(100).default(0),
  description: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});
export type MilestoneInput = z.infer<typeof milestoneSchema>;

export const expenseSchema = z.object({
  projectId: z.string().min(1),
  category: z.enum([
    "LABOR", "MATERIALS", "TRANSPORTATION", "ACCOMMODATION",
    "VENDOR", "EQUIPMENT", "MARKETING", "OTHER",
  ]),
  description: z.string().min(2, "Description is required."),
  vendor: z.string().optional().nullable(),
  date: z.coerce.date(),
  amount: z.coerce.number().positive(),
  tax: z.coerce.number().nonnegative().default(0),
  paymentStatus: z.enum(["UNPAID", "PAID"]).default("UNPAID"),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;
