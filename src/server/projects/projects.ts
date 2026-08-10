"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/workflows/audit";
import { calculateProjectProfitability, validateProjectClosing, closeProject, markProjectCompleted } from "@/lib/workflows/project";
import { computeSCurve } from "@/lib/workflows/calculations";
import { projectUpdateSchema } from "@/lib/validation/project";
import { runAction, type ActionResult } from "@/lib/action-helpers";

export async function listProjects() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");
  return prisma.project.findMany({
    where: { deletedAt: null },
    include: {
      customer: { select: { companyName: true } },
      projectManager: { select: { name: true } },
      _count: { select: { tasks: true, invoices: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProjectDetail(id: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");
  const [project, profitability, closing] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id },
      include: {
        customer: true,
        opportunity: { select: { id: true, number: true } },
        quotation: { select: { id: true, number: true, revision: true, grandTotal: true } },
        projectManager: { select: { id: true, name: true } },
        salesPic: { select: { id: true, name: true } },
        tasks: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { assignedTo: { select: { name: true } } } },
        milestones: { orderBy: { sortOrder: "asc" } },
        expenses: { where: { deletedAt: null }, orderBy: { date: "desc" }, include: { createdBy: { select: { name: true } } } },
        invoices: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { payments: true } },
        folders: { where: { parentId: null }, take: 1 },
        // The whole point of a Project as the shared hub: the customer's own
        // PurchaseOrder (Sales side) and every VendorPurchaseOrder (SSO ->
        // supplier, Procurement side) both carry this same project's id.
        // Pulling both here is what makes that relation actually visible
        // instead of just existing in the schema — see DocumentsPanel.
        purchaseOrders: {
          where: { deletedAt: null },
          orderBy: { poDate: "desc" },
          select: { id: true, number: true, poDate: true, poValue: true, status: true },
        },
        vendorPurchaseOrders: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, number: true, vendorName: true, poDate: true, grandTotal: true, status: true },
        },
      },
    }),
    calculateProjectProfitability(id),
    validateProjectClosing(id),
  ]);

  // Connects the history: the pre-Won Opportunity folder (draft quotations,
  // technical notes, correspondence) isn't moved into the Project — it's
  // linked, so nothing from the Sales stage gets lost when a deal converts.
  const opportunityFolder = project.opportunityId
    ? await prisma.folder.findFirst({ where: { opportunityId: project.opportunityId, parentId: null }, select: { id: true, name: true } })
    : null;

  const sCurve = computeSCurve({
    milestones: project.milestones.map((m) => ({ dueDate: m.dueDate, weightPercent: Number(m.weightPercent), completedAt: m.completedAt })),
    invoices: project.invoices.map((i) => ({ invoiceDate: i.invoiceDate, grandTotal: Number(i.grandTotal), status: i.status })),
    contractValue: Number(project.contractValue),
  });

  return { project, profitability, closing, opportunityFolder, sCurve };
}

export async function updateProject(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");
    const data = projectUpdateSchema.parse(input);

    await prisma.$transaction(async (tx) => {
      const before = await tx.project.findUniqueOrThrow({ where: { id } });
      await tx.project.update({ where: { id }, data });
      await logActivity(tx, {
        userId: actor.userId, action: "UPDATE", entityType: "PROJECT", entityId: id,
        description: `Updated ${before.number}`,
        metadata: { changes: data },
      });
    });

    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
    return { id };
  });
}

export async function markCompletedAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");
    await markProjectCompleted(id, actor);
    revalidatePath(`/projects/${id}`);
    return { id };
  });
}

export async function closeProjectAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await closeProject(id, actor);
    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
    return { id };
  });
}
