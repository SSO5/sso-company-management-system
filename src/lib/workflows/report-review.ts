import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Row locks serialize review decisions with every edit to the working report.
export async function lockReport(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "ProgressReport" WHERE id = ${id} FOR UPDATE`;
}
export async function reviewSource(
  db: Prisma.TransactionClient | typeof prisma,
  id: string,
) {
  const report = await db.progressReport.findUniqueOrThrow({
    where: { id, deletedAt: null },
    include: {
      items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      preparedBy: {
        select: { name: true, title: true, signatureImageUrl: true },
      },
      project: {
        select: {
          number: true,
          name: true,
          customer: { select: { companyName: true } },
        },
      },
      sourceDocument: {
        select: {
          id: true,
          originalName: true,
          storagePath: true,
          progressFormat: true,
          deletedAt: true,
        },
      },
    },
  });
  const company = await db.companySettings.findUnique({
    where: { id: "singleton" },
  });
  const snapshot = JSON.parse(
    JSON.stringify({ report, company }),
  ) as Prisma.InputJsonValue;
  return {
    report,
    snapshot,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex"),
  };
}

// Exact, previously verified account. An inactive or renamed look-alike is never
// silently substituted. This can later become a controlled organizational setting.
export async function reportApprover() {
  return prisma.user.findFirst({
    where: {
      email: "falldyyudianto97@gmail.com",
      isActive: true,
      role: "ADMIN",
    },
    select: { id: true, name: true, whatsappNumber: true },
  });
}
