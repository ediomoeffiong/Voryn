import { Prisma, type User } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "./db.js";

export function correlationId(request: Request) {
  return request.header("x-request-id")?.slice(0, 128) || undefined;
}

export async function writeAudit(request: Request, actor: User, action: string, resourceType: string, resourceId: string, metadata?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action,
      resourceType,
      resourceId,
      correlationId: correlationId(request),
      metadata: metadata as Prisma.InputJsonValue | undefined
    }
  });
}
