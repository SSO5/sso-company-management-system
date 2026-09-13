import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// Only the existing SSO deployment runs this additive migration. Local builds
// do not reach production. No credentials or business rows are logged.
if (process.env.VERCEL !== "1") {
  console.log("Weekly schema: local build, migration skipped.");
} else {
  const db = new PrismaClient();
  const sql = readFileSync(
    new URL("../prisma/deploy/20260914-weekly.sql", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const name = "20260914-weekly-v1";
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(9142026)`;
        await tx.$executeRawUnsafe(
          'CREATE TABLE IF NOT EXISTS "SsoDeploymentMigration" ("name" TEXT PRIMARY KEY, "checksum" TEXT NOT NULL, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())',
        );
        const rows =
          await tx.$queryRaw`SELECT "checksum" FROM "SsoDeploymentMigration" WHERE "name" = ${name}`;
        if (rows.length) {
          if (rows[0].checksum !== checksum)
            throw new Error(
              "Recorded migration checksum differs; manual review required.",
            );
          return;
        }
        for (const statement of sql
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)) {
          // File is version-controlled static DDL generated from the reviewed schema.
          await tx.$executeRawUnsafe(statement);
        }
        await tx.$executeRaw`INSERT INTO "SsoDeploymentMigration" ("name", "checksum") VALUES (${name}, ${checksum})`;
      },
      { timeout: 60000, maxWait: 15000 },
    );
    console.log("Weekly schema: additive migration verified.");
  } catch {
    console.error(
      "Weekly schema migration failed. Deployment stopped; no migration transaction committed.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
