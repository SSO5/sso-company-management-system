/**
 * One-command repair for the two real causes of "email/password salah" that
 * blocked first login after the real-data seed:
 *
 *  1) MIXED-CASE EMAILS. The seed stored "Sultonmuch96@gmail.com" with a
 *     capital S. Postgres string equality is case-sensitive, so typing the
 *     address in lowercase (which every phone keyboard and most humans do)
 *     found no row at all — and the login screen reports a missing row and a
 *     wrong password with the identical message, so it looked like a password
 *     problem. This lowercases every stored email.
 *
 *  2) PASSWORD NEVER SET ON EXISTING ROWS. seed.ts sets passwordHash only in
 *     the upsert's `create` branch, deliberately, so re-seeding never wipes a
 *     password someone already changed. The side effect is that accounts which
 *     already existed before the seed (Galang, and the account Yohana actually
 *     logs in with) kept their OLD password — "Password123!" was never true
 *     for them. This resets the password only for the accounts you name.
 *
 * Usage:
 *   npx tsx prisma/fix-login.ts                      # dry run — shows what it would change
 *   npx tsx prisma/fix-login.ts --apply              # lowercase emails only
 *   npx tsx prisma/fix-login.ts --apply --reset-all  # also reset every active user's password
 *   npx tsx prisma/fix-login.ts --apply --reset=a@b.com,c@d.com
 *
 * The password it sets is "Password123!" unless you pass --password="...".
 * Everyone should change theirs in Settings after logging in once.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const [, ...rest] = hit.split("=");
  return rest.length ? rest.join("=") : "";
}

async function main() {
  const apply = flag("apply") !== undefined;
  const resetAll = flag("reset-all") !== undefined;
  const resetList = (flag("reset") || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const newPassword = flag("password") || "Password123!";

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  console.log(`${users.length} user(s) in the database.${apply ? "" : "  [DRY RUN — nothing will be written]"}\n`);

  // ---- 1) lowercase emails -------------------------------------------
  const mixedCase = users.filter((u) => u.email !== u.email.toLowerCase());
  if (mixedCase.length === 0) {
    console.log("Emails: all already lowercase — nothing to fix.");
  } else {
    for (const u of mixedCase) {
      const lower = u.email.toLowerCase();
      // Guard against a pre-existing lowercase twin, which would otherwise
      // blow up on the unique constraint instead of reporting the conflict.
      const clash = users.find((o) => o.id !== u.id && o.email.toLowerCase() === lower);
      if (clash) {
        console.log(`  SKIP  ${u.email} -> ${lower}  (conflicts with existing "${clash.email}" / ${clash.name} — resolve that duplicate first)`);
        continue;
      }
      console.log(`  ${apply ? "FIX " : "WOULD FIX"}  ${u.name}: ${u.email} -> ${lower}`);
      if (apply) await prisma.user.update({ where: { id: u.id }, data: { email: lower } });
    }
  }

  // ---- 2) reset passwords --------------------------------------------
  const targets = resetAll
    ? users.filter((u) => u.isActive)
    : users.filter((u) => resetList.includes(u.email.toLowerCase()));

  console.log("");
  if (targets.length === 0) {
    console.log("Passwords: no accounts selected. Pass --reset-all or --reset=email1,email2 to reset any.");
  } else {
    const hash = await hashPassword(newPassword);
    for (const u of targets) {
      console.log(`  ${apply ? "RESET" : "WOULD RESET"}  ${u.name} <${u.email.toLowerCase()}> -> "${newPassword}"`);
      if (apply) await prisma.user.update({ where: { id: u.id }, data: { passwordHash: hash } });
    }
  }

  console.log(
    apply
      ? "\nDone. Log in with the lowercase email and the password shown above, then change it in Settings > Users."
      : "\nDry run only — re-run with --apply to actually write these changes."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
