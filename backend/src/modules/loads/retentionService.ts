import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { writeAudit } from '../../lib/audit.js';

/**
 * Retención configurable por administración (FR-022a, SC-005).
 * Por defecto INDEFINITE: nada se descarta. ARCHIVE_AFTER / PURGE_AFTER solo actúan sobre cargas en estado
 * terminal más antiguas que `afterDays`, y SIEMPRE registran la acción en AuditLog (nunca silenciosas).
 */

export type RetentionMode = 'INDEFINITE' | 'ARCHIVE_AFTER' | 'PURGE_AFTER';
export type RetentionAction = 'NONE' | 'ARCHIVE' | 'PURGE';

const TERMINAL_STATUSES = ['CONFIRMED', 'CONFIRMED_WITH_ERRORS', 'FAILED'];

/** Decisión pura de qué hacer con una carga dada la política y el tiempo transcurrido (testeable sin BD). */
export function retentionAction(
  policy: { mode: RetentionMode; afterDays: number | null },
  loadStatus: string,
  loadCreatedAt: Date,
  now: Date,
): RetentionAction {
  if (policy.mode === 'INDEFINITE' || policy.afterDays == null) return 'NONE';
  if (!TERMINAL_STATUSES.includes(loadStatus)) return 'NONE';
  const ageDays = (now.getTime() - loadCreatedAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < policy.afterDays) return 'NONE';
  return policy.mode === 'PURGE_AFTER' ? 'PURGE' : 'ARCHIVE';
}

/** Ejecuta la política de retención por defecto. Devuelve el número de cargas archivadas/purgadas. */
export async function runRetention(now: Date = new Date()): Promise<{ archived: number; purged: number }> {
  const policy = await prisma.retentionPolicy.findFirst({ where: { isDefault: true } });
  if (!policy || policy.mode === 'INDEFINITE' || policy.afterDays == null) {
    logger.info('Retención: política INDEFINITE o ausente; nada que procesar.');
    return { archived: 0, purged: 0 };
  }

  const cutoff = new Date(now.getTime() - policy.afterDays * 24 * 60 * 60 * 1000);
  const candidates = await prisma.load.findMany({
    where: { status: { in: TERMINAL_STATUSES as never }, createdAt: { lt: cutoff }, archivedAt: null },
    select: { id: true },
  });

  let archived = 0;
  let purged = 0;
  for (const load of candidates) {
    if (policy.mode === 'PURGE_AFTER') {
      await prisma.$transaction(async (tx) => {
        await tx.load.delete({ where: { id: load.id } });
        await writeAudit(
          { action: 'LOAD_PURGED', entityType: 'Load', entityId: load.id, detail: { policyId: policy.id, afterDays: policy.afterDays } },
          tx,
        );
      });
      purged += 1;
    } else {
      await prisma.$transaction(async (tx) => {
        // Archivar: liberar el blob original y marcar la fecha; se conserva el registro de trazabilidad.
        await tx.load.update({ where: { id: load.id }, data: { archivedAt: now, originalBlob: Buffer.alloc(0) } });
        await writeAudit(
          { action: 'LOAD_ARCHIVED', entityType: 'Load', entityId: load.id, detail: { policyId: policy.id, afterDays: policy.afterDays } },
          tx,
        );
      });
      archived += 1;
    }
  }
  logger.info({ archived, purged }, 'Retención ejecutada');
  return { archived, purged };
}
