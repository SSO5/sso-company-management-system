"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import type { SearchResult } from "@/types/search";

/** Global search across every major entity (spec section 34). */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  await requireUserOrThrow();
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();

  const [customers, quotations, projects, invoices, opportunities] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null, OR: [{ companyName: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }] },
      take: 5,
    }),
    prisma.quotation.findMany({
      where: { deletedAt: null, number: { contains: q, mode: "insensitive" } },
      take: 5,
      include: { customer: { select: { companyName: true } } },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, OR: [{ number: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
      take: 5,
    }),
    prisma.invoice.findMany({ where: { deletedAt: null, number: { contains: q, mode: "insensitive" } }, take: 5 }),
    prisma.opportunity.findMany({ where: { deletedAt: null, OR: [{ number: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }, take: 5 }),
  ]);

  return [
    ...customers.map((c) => ({ type: "Customer", id: c.id, label: `${c.number} — ${c.companyName}`, href: `/sales/customers/${c.id}` })),
    ...quotations.map((q2) => ({ type: "Quotation", id: q2.id, label: `${q2.number} — ${q2.customer.companyName}`, href: `/sales/quotations/${q2.id}` })),
    ...projects.map((p) => ({ type: "Project", id: p.id, label: `${p.number} — ${p.name}`, href: `/projects/${p.id}` })),
    ...invoices.map((i) => ({ type: "Invoice", id: i.id, label: i.number, href: `/finance/invoices/${i.id}` })),
    ...opportunities.map((o) => ({ type: "Opportunity", id: o.id, label: `${o.number} — ${o.name}`, href: `/sales/opportunities` })),
  ];
}
