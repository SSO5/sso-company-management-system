import type { Prisma, ActivityAction } from "@prisma/client";

/**
 * Every important transaction must be traceable (spec section 33/56).
 * Always call this INSIDE the same `tx` as the mutation it describes, so the
 * audit record and the business change succeed or fail together.
 */
export async function logActivity(
  tx: Prisma.TransactionClient,
  params: {
    userId?: string | null;
    action: ActivityAction;
    entityType: string;
    entityId: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  await tx.activityLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      description: params.description,
      metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : undefined,
    },
  });
}
