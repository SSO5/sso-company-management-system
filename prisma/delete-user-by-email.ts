/**
 * Safely remove one duplicate/stale user by email: tries a permanent
 * delete, and if the user turns out to have linked records after all
 * (quotations, invoices, etc.), falls back to deactivating instead of
 * leaving orphaned foreign keys — same safety behavior as the in-app
 * Settings > Users > Delete button.
 *
 * Run with: npx tsx prisma/delete-user-by-email.ts <email>
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx prisma/delete-user-by-email.ts <email>");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}. Run "npx tsx prisma/list-users.ts" to see current emails.`);
    process.exit(1);
  }
  try {
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`Deleted ${user.name} <${email}> permanently — no linked records were found.`);
  } catch {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    console.log(`${user.name} <${email}> has linked records and can't be permanently deleted — deactivated instead (isActive=false). It will no longer log in or receive notifications, but historical records stay intact.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
