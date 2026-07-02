import type { LoadStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { computeBackoffMs } from '../../lib/backoff.js';
import {
  sendInventory,
  type ClassifiedResponse,
  type InventoryItem,
  type RedVidarClientDeps,
} from '../redvidar/redvidarClient.js';
import { markJobDone, markJobFailed, rescheduleJob, type ClaimedJob } from '../queue/dispatchQueue.js';

export const MAX_ATTEMPTS = 5;

export interface DispatchDeps {
  client: RedVidarClientDeps;
  /** Reloj inyectable para pruebas. */
  now?: () => number;
  /** Aleatoriedad inyectable para el jitter del backoff. */
  random?: () => number;
}

/**
 * Procesa un job reclamado: envía la carga a Red Vidar (UN POST con todos los válidos, FR-013a),
 * ramifica por resultado (FR-017), persiste el intento (FR-021), y actualiza estado/resultado (FR-018/019).
 */
export async function processJob(job: ClaimedJob, deps: DispatchDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const load = await prisma.load.findUnique({ where: { id: job.loadId }, include: { rows: true } });
  if (!load) {
    await markJobFailed(job.id, job.attempts, 'La carga asociada no existe.');
    return;
  }
  if (!load.idempotencyKey) {
    await markJobFailed(job.id, job.attempts, 'La carga no tiene clave de idempotencia.');
    return;
  }

  const items: InventoryItem[] = load.rows
    .filter((r) => r.status === 'VALID' && r.redVidarPharmacyCode)
    .map((r) => ({
      pharmacyCode: r.redVidarPharmacyCode as string,
      ean: r.ean,
      productName: r.productName,
      stock: r.stock,
    }));

  const attemptNumber = job.attempts + 1;
  const attempt = await prisma.dispatchAttempt.create({
    data: { loadId: load.id, attemptNumber, outcome: 'PENDING' },
  });
  await prisma.load.update({ where: { id: load.id }, data: { status: 'SENT' } });

  let classified: ClassifiedResponse;
  try {
    classified = await sendInventory(
      { sourceLabel: load.sourceLabel ?? 'plataforma', items, idempotencyKey: load.idempotencyKey },
      deps.client,
    );
  } catch (err) {
    // Error de red/timeout => transitorio (RETRYABLE)
    classified = {
      outcome: 'RETRYABLE',
      httpStatus: 0,
      envelope: null,
      retryAfterMs: null,
      errorReason: `Error de red al contactar Red Vidar: ${(err as Error).message}`,
    };
  }

  await prisma.dispatchAttempt.update({
    where: { id: attempt.id },
    data: {
      finishedAt: new Date(now()),
      httpStatus: classified.httpStatus || null,
      webhookEventId: classified.envelope?.webhookEventId ?? null,
      outcome: classified.outcome,
      retryAfterMs: classified.retryAfterMs,
      errorReason: classified.errorReason,
    },
  });

  if (classified.outcome === 'SUCCESS' || classified.outcome === 'SUCCESS_WITH_ERRORS') {
    await persistResultAndConfirm(load.id, classified);
    await markJobDone(job.id);
    return;
  }

  if (classified.outcome === 'NON_RETRYABLE') {
    await setLoadStatus(load.id, 'FAILED');
    await markJobFailed(job.id, attemptNumber, classified.errorReason ?? 'Fallo no recuperable.');
    return;
  }

  // RETRYABLE
  if (attemptNumber >= MAX_ATTEMPTS) {
    await setLoadStatus(load.id, 'FAILED');
    await markJobFailed(job.id, attemptNumber, `Agotados ${MAX_ATTEMPTS} intentos. ${classified.errorReason ?? ''}`.trim());
    return;
  }
  const delayMs = computeBackoffMs(attemptNumber, classified.retryAfterMs, { random: deps.random });
  const availableAt = new Date(now() + delayMs);
  await rescheduleJob(job.id, attemptNumber, availableAt, classified.errorReason ?? 'Reintento programado.');
  logger.info({ loadId: load.id, attemptNumber, delayMs }, 'Reintento de despacho programado');
}

async function persistResultAndConfirm(loadId: string, classified: ClassifiedResponse): Promise<void> {
  const env = classified.envelope;
  const result = env?.result ?? null;
  const status: LoadStatus = classified.outcome === 'SUCCESS_WITH_ERRORS' ? 'CONFIRMED_WITH_ERRORS' : 'CONFIRMED';
  await prisma.$transaction(async (tx) => {
    if (env) {
      await tx.redVidarResult.upsert({
        where: { loadId },
        create: {
          loadId,
          webhookEventId: env.webhookEventId,
          processingStatus: env.processingStatus,
          status: env.status,
          entriesInserted: result?.entriesInserted ?? null,
          medicationsInserted: result?.medicationsInserted ?? null,
          medicationsUpdated: result?.medicationsUpdated ?? null,
          unknownPharmacyCodes: result?.unknownPharmacyCodes ?? [],
          rowErrors: (result?.errors ?? []) as object,
          rawResponse: env as unknown as object,
        },
        update: {},
      });
    }
    await tx.load.update({ where: { id: loadId }, data: { status } });
  });
}

async function setLoadStatus(loadId: string, status: LoadStatus): Promise<void> {
  await prisma.load.update({ where: { id: loadId }, data: { status } });
}
