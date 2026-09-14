"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction } from "@/lib/action-helpers";
import { logActivity } from "@/lib/workflows/audit";
import {
  billingTotals,
  exactPoMatch,
  issuedInvoice,
} from "@/lib/finance-overview";
import {
  invoiceDueAmount,
  invoiceOutstanding,
} from "@/lib/workflows/calculations";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseReportDate } from "@/lib/weekly-policy";

export async function getFinanceWorkspace() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "finance", "view");
  const [
    orders,
    invoices,
    vendors,
    expenses,
    company,
    payments,
    projects,
    work,
    users,
    bank,
    estimates,
    documents,
  ] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { deletedAt: null, status: { not: "CANCELLED" } },
      include: {
        customer: { select: { companyName: true } },
        project: { select: { name: true, number: true } },
      },
      orderBy: { poDate: "desc" },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        customer: { select: { companyName: true } },
        payments: { where: { deletedAt: null } },
      },
      orderBy: { invoiceDate: "desc" },
    }),
    prisma.vendorPurchaseOrder.findMany({
      where: { deletedAt: null, status: { not: "CANCELLED" } },
      include: { expense: true },
      orderBy: { poDate: "desc" },
    }),
    prisma.projectExpense.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
    }),
    prisma.companyExpense.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
    }),
    prisma.payment.findMany({
      where: {
        deletedAt: null,
        invoice: {
          deletedAt: null,
          status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
        },
      },
      include: {
        invoice: { select: { number: true } },
        customer: { select: { companyName: true } },
      },
      orderBy: { paymentDate: "desc" },
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        number: true,
        name: true,
        contractValue: true,
        budget: true,
      },
      orderBy: { number: "desc" },
    }),
    prisma.financeWorkItem.findMany({
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
    prisma.financeBankBalance.findMany({
      orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    }),
    prisma.financeProjectEstimate.findMany(),
    prisma.document.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        uploadedAt: true,
        relatedEntityType: true,
        relatedEntityId: true,
        folder: { select: { projectId: true } },
      },
      orderBy: { uploadedAt: "desc" },
      take: 1000,
    }),
  ]);
  const list = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    customer: i.customer.companyName,
    customerId: i.customerId,
    projectId: i.projectId,
    poId: exactPoMatch(i.customerPO, i.customerId, orders),
    poRef: i.customerPO,
    date: i.invoiceDate.toISOString(),
    due: i.dueDate.toISOString(),
    status: i.status,
    grandTotal: Number(i.grandTotal),
    dpPercent: i.dpPercent === null ? null : Number(i.dpPercent),
    paidAmount: Number(i.paidAmount),
    withholdingTax: Number(i.withholdingTax),
    dueAmount: invoiceDueAmount(i),
    outstanding: issuedInvoice(i.status) ? invoiceOutstanding(i) : 0,
    paymentRows: i.payments.reduce((s, p) => s + Number(p.amount), 0),
    withholdingRows: i.payments.reduce(
      (s, p) => s + Number(p.withholdingTax),
      0,
    ),
  }));
  const totals = billingTotals(list);
  return {
    actorId: actor.userId,
    role: actor.role,
    users,
    totals,
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      customer: o.customer.companyName,
      projectId: o.projectId,
      project: o.project?.name ?? "Belum terhubung ke proyek",
      value: Number(o.poValue),
      terms: o.paymentTerms,
      date: o.poDate.toISOString(),
      status: o.status,
      ...billingTotals(list.filter((i) => i.poId === o.id)),
    })),
    invoices: list,
    vendors: vendors.map((v) => ({
      id: v.id,
      number: v.number,
      name: v.vendorName,
      projectId: v.projectId,
      reference: v.projectRef,
      terms: v.paymentTerms,
      total: Number(v.grandTotal),
      status: v.status,
      expenseId: v.expense?.deletedAt ? null : (v.expense?.id ?? null),
      paymentStatus: v.expense?.deletedAt
        ? null
        : (v.expense?.paymentStatus ?? null),
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      number: e.number,
      projectId: e.projectId,
      description: e.description,
      total: Number(e.total),
      net: Number(e.amount),
      status: e.approvalStatus,
      paymentStatus: e.paymentStatus,
      vendorId: e.vendorPurchaseOrderId,
      date: e.date.toISOString(),
    })),
    company: company.map((e) => ({
      id: e.id,
      number: e.number,
      description: e.description,
      total: Number(e.total),
      status: e.approvalStatus,
      paymentStatus: e.paymentStatus,
      date: e.date.toISOString(),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      number: p.number,
      invoice: p.invoice.number,
      invoiceId: p.invoiceId,
      customer: p.customer.companyName,
      projectId: p.projectId,
      date: p.paymentDate.toISOString(),
      amount: Number(p.amount),
      withholding: Number(p.withholdingTax),
    })),
    projects: projects.map((p) => ({
      ...p,
      contractValue: Number(p.contractValue),
      budget: Number(p.budget),
    })),
    work: work.map((w) => ({
      ...w,
      dueAt: w.dueAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    })),
    bank: bank.map((b) => ({
      ...b,
      amount: Number(b.amount),
      asOf: b.asOf.toISOString(),
      createdAt: b.createdAt.toISOString(),
    })),
    estimates: estimates.map((e) => ({
      ...e,
      netSales: Number(e.netSales),
      totalForecastCost: Number(e.totalForecastCost),
      updatedAt: e.updatedAt.toISOString(),
    })),
    documents: documents.map((d) => ({
      ...d,
      uploadedAt: d.uploadedAt.toISOString(),
      projectId: d.folder?.projectId ?? null,
      folder: undefined,
    })),
  };
}
const optionalId = z.string().max(100).nullable().optional();
const workSchema = z.object({
  id: optionalId,
  title: z.string().trim().min(5).max(200),
  kind: z.enum(["BILLING", "VENDOR", "TAX", "COMPANY"]),
  projectId: optionalId,
  reference: z.string().max(200).nullable().optional(),
  ownerId: optionalId,
  dueAt: z.string().nullable().optional(),
  status: z.enum(["OPEN", "WAITING", "READY", "DONE"]),
  checks: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(150),
        done: z.boolean(),
        ownerId: optionalId,
      }),
    )
    .max(20),
  notes: z.string().max(3000).nullable().optional(),
});
export async function saveFinanceWork(input: unknown) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "update");
    const data = workSchema.parse(input);
    if (!data.id) requirePermission(actor.role, "finance", "create");
    if (
      data.projectId &&
      !(await prisma.project.count({
        where: { id: data.projectId, deletedAt: null },
      }))
    )
      throw new Error("Proyek tidak tersedia.");
    const ownerIds = [
      data.ownerId,
      ...data.checks.map((c) => c.ownerId),
    ].filter((id): id is string => Boolean(id));
    if (
      (await prisma.user.count({
        where: { id: { in: [...new Set(ownerIds)] }, isActive: true },
      })) !== new Set(ownerIds).size
    )
      throw new Error("PIC harus merupakan akun aktif.");
    const dueAt = data.dueAt ? parseReportDate(data.dueAt) : null;
    if (data.dueAt && !dueAt) throw new Error("Tanggal target tidak valid.");
    if (
      ["READY", "DONE"].includes(data.status) &&
      data.checks.some((c) => !c.done)
    )
      throw new Error(
        "Selesaikan prasyarat terlebih dahulu atau gunakan status Menunggu.",
      );
    if (data.status === "DONE" && !data.notes?.trim())
      throw new Error("Tulis hasil atau rujukan bukti penyelesaian.");
    const { id, ...values } = data;
    const record = await prisma.$transaction(async (tx) => {
      const previous = id
        ? await tx.financeWorkItem.findUniqueOrThrow({ where: { id } })
        : null;
      const item = id
        ? await tx.financeWorkItem.update({
            where: { id },
            data: { ...values, dueAt, updatedById: actor.userId },
          })
        : await tx.financeWorkItem.create({
            data: {
              ...values,
              dueAt,
              createdById: actor.userId,
              updatedById: actor.userId,
            },
          });
      await logActivity(tx, {
        userId: actor.userId,
        action: id ? "UPDATE" : "CREATE",
        entityType: "FINANCE_WORK",
        entityId: item.id,
        description: `${item.title}: ${previous?.status ?? "baru"} → ${item.status}. Prasyarat: ${JSON.stringify(item.checks)}. Hasil: ${item.notes ?? "—"}`,
      });
      return item;
    });
    revalidatePath("/finance");
    return { id: record.id };
  });
}
export async function saveBankBalance(input: unknown) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "create");
    const data = z
      .object({
        bankName: z.string().trim().min(3).max(100),
        asOf: z.string(),
        amount: z.coerce.number().finite().min(0).max(1e14),
        sourceDocumentId: z.string().min(1),
      })
      .parse(input);
    const asOf = parseReportDate(data.asOf);
    if (!asOf || asOf > new Date())
      throw new Error("Tanggal saldo harus valid dan tidak di masa depan.");
    if (
      !(await prisma.document.count({
        where: { id: data.sourceDocumentId, deletedAt: null },
      }))
    )
      throw new Error("Pilih dokumen bukti saldo yang tersimpan.");
    const record = await prisma.$transaction(async (tx) => {
      const r = await tx.financeBankBalance.create({
        data: { ...data, asOf, createdById: actor.userId },
      });
      await logActivity(tx, {
        userId: actor.userId,
        action: "CREATE",
        entityType: "BANK_BALANCE",
        entityId: r.id,
        description: `Saldo ${r.bankName} per ${data.asOf} dicatat menurut dokumen sumber; bukan hasil rekonsiliasi otomatis.`,
      });
      return r;
    });
    revalidatePath("/finance");
    return { id: record.id };
  });
}
export async function saveProjectEstimate(input: unknown) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "update");
    const data = z
      .object({
        projectId: z.string(),
        netSales: z.coerce.number().finite().positive().max(1e14),
        totalForecastCost: z.coerce.number().finite().min(0).max(1e14),
        basis: z.string().trim().min(20).max(3000),
      })
      .parse(input);
    if (
      !(await prisma.project.count({
        where: { id: data.projectId, deletedAt: null },
      }))
    )
      throw new Error("Proyek tidak tersedia.");
    await prisma.$transaction(async (tx) => {
      const before = await tx.financeProjectEstimate.findUnique({
        where: { projectId: data.projectId },
      });
      await tx.financeProjectEstimate.upsert({
        where: { projectId: data.projectId },
        create: { ...data, updatedById: actor.userId },
        update: { ...data, updatedById: actor.userId },
      });
      await logActivity(tx, {
        userId: actor.userId,
        action: before ? "UPDATE" : "CREATE",
        entityType: "FINANCE_ESTIMATE",
        entityId: data.projectId,
        description: `Proyeksi diperbarui: ${JSON.stringify(before)} → ${JSON.stringify(data)}`,
      });
    });
    revalidatePath("/finance");
    return { id: data.projectId };
  });
}
