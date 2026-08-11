/**
 * Quick targeted field fix for one user by email — for small corrections
 * that don't need a full re-seed. Only updates the fields you pass.
 *
 * Run with: npx tsx prisma/update-user.ts <email> [--role=SALES] [--title="Sales Engineer"]
 */
import { PrismaClient, UserRole } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const [email, ...rest] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: npx tsx prisma/update-user.ts <email> [--role=SALES] [--title="Sales Engineer"]');
    process.exit(1);
  }
  const data: { role?: UserRole; title?: string } = {};
  for (const arg of rest) {
    const [key, ...valParts] = arg.replace(/^--/, "").split("=");
    const val = valParts.join("=");
    if (key === "role") data.role = val as UserRole;
    if (key === "title") data.title = val;
  }
  if (Object.keys(data).length === 0) {
    console.error("Nothing to update — pass at least --role=... or --title=...");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}.`);
    process.exit(1);
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data });
  console.log(`Updated ${updated.name} <${email}>: role=${updated.role}, title=${updated.title ?? "-"}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
