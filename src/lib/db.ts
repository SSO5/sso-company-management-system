import { PrismaClient } from "@prisma/client";

// Standard Next.js singleton pattern to avoid exhausting DB connections
// during dev-mode hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Several workflows (opportunity/project folder creation, Won-trigger
    // migration) run 10-25 sequential queries inside one interactive
    // $transaction. Prisma's default timeout (5s) and maxWait (2s) are tuned
    // for a handful of queries against a local DB — too tight for a remote
    // Neon (Singapore) connection through PgBouncer from a Vercel serverless
    // function, especially on a cold start or after the Neon compute
    // auto-suspends. Without this, those transactions get killed mid-way
    // with "Transaction already closed: Could not perform operation."
    transactionOptions: { timeout: 20000, maxWait: 10000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
