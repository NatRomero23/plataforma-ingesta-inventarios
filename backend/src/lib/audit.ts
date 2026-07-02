import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';

/**
 * Registro auditable de acciones sensibles (FR-022a, FR-028): revocación de claves, rotación, etc.
 * Nunca ocurre de forma silenciosa. Acepta un cliente transaccional para escribir dentro de una transacción.
 */
export async function writeAudit(
  entry: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    detail?: Prisma.InputJsonValue;
  },
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      detail: entry.detail,
    },
  });
}
