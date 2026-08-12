/**
 * Merge two user accounts that are really the same person.
 *
 * Why this exists: seed.ts upserts by the NEW real email, so when a person
 * already had an account under a different address, Prisma took the `create`
 * branch and made a second row instead of updating the first. Yohana ended up
 * with her transaction history on one account and her actual daily login on
 * another — a split record that quietly makes every "who did this" report
 * wrong.
 *
 * How it finds what to move: rather than hand-listing the ~40 User relations
 * in schema.prisma (miss one and the delete fails, or worse, succeeds against
 * a half-migrated record), it asks Postgres itself for every foreign key that
 * points at "User" and rewrites all of them. Completeness is guaranteed by the
 * database, not by my memory.
 *
 * Everything runs in ONE transaction: either the whole identity moves or
 * nothing does. Never leave a person half-merged.
 *
 * Usage:
 *   npx tsx prisma/merge-users.ts --from=old@x.com --to=keep@y.com
 *   npx tsx prisma/merge-users.ts --from=old@x.com --to=keep@y.com --apply
 *
 * The --to account is the SURVIVOR (the one people log in with). The --from
 * account is deleted after its history has been reassigned; if anything still
 * references it, it is deactivated instead of deleted, so nothing is lost.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const [, ...rest] = hit.split("=");
  return rest.length ? rest.join("=") : "";
}

interface FkRow {
  table_name: string;
  column_name: string;
}

async function main() {
  const fromEmail = flag("from");
  const toEmail = flag("to");
  const apply = flag("apply") !== undefined;
  if (!fromEmail || !toEmail) {
    console.error("Usage: npx tsx prisma/merge-users.ts --from=old@x.com --to=keep@y.com [--apply]");
    process.exit(1);
  }

  const from = await prisma.user.findFirst({ where: { email: { equals: fromEmail, mode: "insensitive" } } });
  const to = await prisma.user.findFirst({ where: { email: { equals: toEmail, mode: "insensitive" } } });
  if (!from) { console.error(`No user with email ${fromEmail}`); process.exit(1); }
  if (!to) { console.error(`No user with email ${toEmail}`); process.exit(1); }
  if (from.id === to.id) { console.error("Both emails resolve to the same account — nothing to merge."); process.exit(1); }

  console.log(`FROM (will be removed): ${from.name} <${from.email}>  role=${from.role}  id=${from.id}`);
  console.log(`TO   (survivor)       : ${to.name} <${to.email}>  role=${to.role}  id=${to.id}`);
  console.log(apply ? "" : "\n[DRY RUN — nothing will be written]\n");

  // Ask Postgres for every FK column pointing at "User".
  const fks = await prisma.$queryRaw<FkRow[]>`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'User'
      AND tc.table_schema = current_schema()
    ORDER BY tc.table_name, kcu.column_name;
  `;

  console.log(`${fks.length} foreign-key column(s) reference User.\n`);

  let totalRows = 0;
  const plan: { table: string; column: string; rows: number }[] = [];
  for (const fk of fks) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "${fk.table_name}" WHERE "${fk.column_name}" = $1`,
      from.id
    );
    const n = Number(rows[0]?.count ?? 0);
    if (n > 0) {
      plan.push({ table: fk.table_name, column: fk.column_name, rows: n });
      totalRows += n;
    }
  }

  if (plan.length === 0) {
    console.log("No records reference the FROM account — it is a clean duplicate, safe to delete outright.");
  } else {
    for (const p of plan) console.log(`  ${p.rows.toString().padStart(4)} row(s)  ${p.table}.${p.column}`);
    console.log(`  ${"".padStart(4)}          -> ${totalRows} total to reassign`);
  }

  if (!apply) {
    console.log("\nDry run only — re-run with --apply to perform the merge.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      await tx.$executeRawUnsafe(
        `UPDATE "${p.table}" SET "${p.column}" = $1 WHERE "${p.column}" = $2`,
        to.id, from.id
      );
    }
    // Carry over any profile detail the survivor is missing, so nothing the
    // seed set up (title, WhatsApp number, signature) is lost with the row.
    await tx.user.update({
      where: { id: to.id },
      data: {
        name: to.name || from.name,
        title: to.title ?? from.title,
        whatsappNumber: to.whatsappNumber ?? from.whatsappNumber,
        signatureImageUrl: to.signatureImageUrl ?? from.signatureImageUrl,
      },
    });
    try {
      await tx.user.delete({ where: { id: from.id } });
      console.log(`\nMerged ${totalRows} record(s) and deleted ${from.email}.`);
    } catch {
      await tx.user.update({ where: { id: from.id }, data: { isActive: false } });
      console.log(`\nMerged ${totalRows} record(s). ${from.email} could not be deleted (something still references it) — deactivated instead.`);
    }
  });

  const check = await prisma.user.findMany({
    where: { OR: [{ email: fromEmail }, { email: toEmail }] },
    select: { name: true, email: true, role: true, title: true, isActive: true },
  });
  console.log("\nResult:");
  for (const u of check) console.log(`  ${u.name} <${u.email}>  ${u.role}  ${u.title ?? "-"}  active=${u.isActive}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
