import { PrismaClient } from "@prisma/client";

// Standard Next.js singleton pattern to avoid exhausting DB connections
// during dev-mode hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Several workflows (opportunity/project folder creation, Won-trigger
    // migration) run ~20-25 sequential queries inside one interactive
    // $transaction — already cut down from ~50 by batching folder-tree
    // creation (see lib/workflows/folders.ts:createTree) and moving
    // notifications out of the transaction (see
    // lib/workflows/project.ts:convertQuotationToProject). Prisma's default
    // timeout (5s) and maxWait (2s) are tuned for a handful of queries
    // against a local DB — too tight for a remote Neon (Singapore) connection
    // through PgBouncer from a Vercel serverless function (deployed in
    // Washington DC / iad1 by default — that region mismatch alone costs
    // ~150-250ms of network latency PER query), especially on a cold start or
    // after Neon's compute auto-suspends. 30s/15s gives real headroom on top
    // of the query-count reduction above; if "Transaction already closed"
    // still recurs, the next lever is aligning the Vercel function region
    // with Neon's region (see Settings > Functions in the Vercel dashboard,
    // or vercel.json's "regions" — requires a paid Vercel plan for a
    // non-default region), not raising this further.
    transactionOptions: { timeout: 30000, maxWait: 15000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
