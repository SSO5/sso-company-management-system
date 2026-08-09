import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getSession();
  if (session) {
    await prisma.activityLog.create({
      data: {
        userId: session.userId,
        action: "LOGOUT",
        entityType: "USER",
        entityId: session.userId,
        description: `${session.name} logged out`,
      },
    });
  }
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url));
}
