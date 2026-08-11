/**
 * Read-only helper: print every User row so duplicates (old @sso.demo /
 * stray accounts vs. the newly corrected real-email accounts) can be
 * visually identified before anyone decides what to merge or delete.
 * Run with: npx tsx prisma/list-users.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, name: true, email: true, role: true, title: true,
      whatsappNumber: true, isActive: true, createdAt: true,
      _count: {
        select: {
          quotationsCreated: true, createdVendorPOs: true, createdInvoices: true,
          createdExpenses: true, createdCustomers: true, progressReportsCreated: true,
        },
      },
    },
  });

  console.log(`\n${users.length} user(s) total:\n`);
  for (const u of users) {
    const linked = Object.values(u._count).reduce((a, b) => a + b, 0);
    console.log(
      `${u.isActive ? " " : "[INACTIVE] "}${u.name.padEnd(20)} | ${u.email.padEnd(32)} | ${u.role.padEnd(16)} | ${(u.title ?? "-").padEnd(20)} | WA:${u.whatsappNumber ?? "-"} | linked records: ${linked} | id:${u.id}`
    );
  }
  console.log("\nAny row with 'linked records: 0' and an old @sso.demo / unfamiliar email is almost certainly a safe-to-remove duplicate.");
  console.log("Remove one via: npx tsx prisma/delete-user-by-email.ts <email>  (script below)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
