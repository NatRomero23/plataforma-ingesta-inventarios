import 'dotenv/config';
import { loadConfig } from './config/index.js';
import { logger } from './lib/logger.js';
import { GlobalRateLimiter } from './modules/dispatch/rateLimiter.js';
import { processJob } from './modules/dispatch/dispatchService.js';
import { claimNextJob, lastAttemptFinishedAt } from './modules/queue/dispatchQueue.js';

/**
 * Worker de despacho a Red Vidar (FR-013). Concurrencia 1 con limitador GLOBAL de 10 req/min (D2).
 * Reclama jobs de la cola (FOR UPDATE SKIP LOCKED) y los envía respetando el ritmo.
 */
const POLL_INTERVAL_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(): Promise<void> {
  const config = loadConfig();
  const limiter = new GlobalRateLimiter({ maxRequests: 10, windowMs: 60_000 });

  // Sembrar el limitador tras un reinicio para no rebasar el ritmo (D2).
  const seed = await lastAttemptFinishedAt();
  if (seed !== null) limiter.seedLastRequest(seed);

  const clientDeps = { baseUrl: config.RED_VIDAR_BASE_URL, apiKey: config.RED_VIDAR_API_KEY };
  logger.info('Worker de despacho iniciado');

  // Latido de inactividad: confirma que el loop sigue sondeando sin llenar el log en cada ciclo.
  const HEARTBEAT_MS = 30_000;
  let lastHeartbeat = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const wait = limiter.msUntilNextAllowed();
      if (wait > 0) await sleep(wait);

      const job = await claimNextJob();
      if (!job) {
        const t = Date.now();
        if (t - lastHeartbeat >= HEARTBEAT_MS) {
          logger.info('Sondeando la cola: sin jobs reclamables');
          lastHeartbeat = t;
        }
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      lastHeartbeat = 0; // fuerza latido tras vaciar la cola
      limiter.recordRequest();
      logger.info({ jobId: job.id, loadId: job.loadId, attempts: job.attempts }, 'Job reclamado; despachando');
      try {
        await processJob(job, { client: clientDeps });
        logger.info({ jobId: job.id, loadId: job.loadId }, 'Job procesado');
      } catch (err) {
        logger.error({ err, jobId: job.id }, 'Error inesperado procesando job');
      }
    } catch (err) {
      // Un error transitorio de infraestructura (p. ej. conexión de BD caída tras suspender el equipo,
      // o una transacción interactiva expirada) NO debe tumbar el worker: se registra y se reintenta en
      // el siguiente ciclo. Prisma reabre la conexión automáticamente. Se espera un poco para no entrar
      // en un bucle de error apretado si la BD sigue no disponible.
      logger.error({ err }, 'Error transitorio en el ciclo del worker; se reintenta en el siguiente ciclo');
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

run().catch((err) => {
  logger.error({ err }, 'El worker terminó con error');
  process.exit(1);
});
