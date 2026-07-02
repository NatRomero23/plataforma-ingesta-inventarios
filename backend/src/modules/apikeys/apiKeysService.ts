import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { writeAudit } from '../../lib/audit.js';
import { loadConfig } from '../../config/index.js';

/**
 * Claves de API de integradores (FR-028, Principio V).
 * - Prefijo propio de la plataforma (NUNCA rv_pc_live_).
 * - Secreto en claro visible UNA sola vez; se persiste solo el hash bcrypt.
 * - Invariante: a lo sumo una ACTIVE por cadena. Generar revoca automáticamente la ACTIVE previa
 *   dentro de la misma transacción y registra ambas acciones en AuditLog (remediación U1).
 */
export async function generateApiKey(
  chainId: string,
  actorUserId: string | null,
): Promise<{ apiKey: string; last4: string; chainId: string }> {
  const chain = await prisma.chain.findUnique({ where: { id: chainId } });
  if (!chain) throw new AppError(404, 'CADENA_NO_ENCONTRADA', 'No se encontró la cadena.');

  const prefix = loadConfig().PLATFORM_API_KEY_PREFIX;
  const secret = `${prefix}${randomBytes(24).toString('hex')}`;
  const keyHash = await bcrypt.hash(secret, 10);
  const last4 = secret.slice(-4);

  await prisma.$transaction(async (tx) => {
    const previous = await tx.apiKey.findMany({ where: { chainId, status: 'ACTIVE' } });
    if (previous.length > 0) {
      await tx.apiKey.updateMany({
        where: { chainId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      for (const p of previous) {
        await writeAudit(
          { actorUserId, action: 'API_KEY_AUTO_REVOKED', entityType: 'ApiKey', entityId: p.id, detail: { chainId, reason: 'rotación por nueva clave' } },
          tx,
        );
      }
    }
    const created = await tx.apiKey.create({ data: { chainId, prefix, keyHash, last4 } });
    await writeAudit(
      { actorUserId, action: 'API_KEY_GENERATED', entityType: 'ApiKey', entityId: created.id, detail: { chainId, last4 } },
      tx,
    );
  });

  // El secreto en claro se devuelve una sola vez; nunca se persiste ni se vuelve a mostrar.
  return { apiKey: secret, last4, chainId };
}

export async function revokeApiKey(apiKeyId: string, actorUserId: string | null): Promise<void> {
  const key = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });
  if (!key) throw new AppError(404, 'CLAVE_NO_ENCONTRADA', 'No se encontró la clave de API.');
  await prisma.$transaction(async (tx) => {
    await tx.apiKey.update({ where: { id: apiKeyId }, data: { status: 'REVOKED', revokedAt: new Date() } });
    await writeAudit(
      { actorUserId, action: 'API_KEY_REVOKED', entityType: 'ApiKey', entityId: apiKeyId, detail: { chainId: key.chainId } },
      tx,
    );
  });
}
