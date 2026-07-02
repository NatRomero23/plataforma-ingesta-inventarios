import { prisma } from '../../lib/prisma.js';

/**
 * Cola de despacho respaldada en PostgreSQL (D1). El reclamo usa FOR UPDATE SKIP LOCKED para tomar
 * atómicamente el siguiente job disponible sin bloquear a otros procesos. Los envíos salen siempre de aquí,
 * nunca directo de la petición del usuario (FR-013).
 */

export interface ClaimedJob {
  id: string;
  loadId: string;
  attempts: number;
}

/** Reclama el siguiente job QUEUED cuyo availableAt ya pasó, marcándolo CLAIMED en la misma transacción. */
export async function claimNextJob(): Promise<ClaimedJob | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; loadId: string; attempts: number }>>`
      SELECT id, "loadId", attempts
      FROM "DispatchJob"
      WHERE status = 'QUEUED' AND "availableAt" <= now()
      ORDER BY "availableAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1`;
    if (rows.length === 0) return null;
    const job = rows[0];
    await tx.dispatchJob.update({ where: { id: job.id }, data: { status: 'CLAIMED', lockedAt: new Date() } });
    return job;
  });
}

export async function markJobDone(jobId: string): Promise<void> {
  await prisma.dispatchJob.update({ where: { id: jobId }, data: { status: 'DONE' } });
}

export async function markJobFailed(jobId: string, attempts: number, lastError: string): Promise<void> {
  await prisma.dispatchJob.update({ where: { id: jobId }, data: { status: 'FAILED', attempts, lastError } });
}

/** Reprograma un job para un reintento futuro (backoff / Retry-After). */
export async function rescheduleJob(jobId: string, attempts: number, availableAt: Date, lastError: string): Promise<void> {
  await prisma.dispatchJob.update({
    where: { id: jobId },
    data: { status: 'QUEUED', attempts, availableAt, lockedAt: null, lastError },
  });
}

/** Marca de tiempo del último intento finalizado (para sembrar el limitador tras un reinicio). */
export async function lastAttemptFinishedAt(): Promise<number | null> {
  const attempt = await prisma.dispatchAttempt.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  });
  return attempt?.finishedAt ? attempt.finishedAt.getTime() : null;
}
