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

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const wait = limiter.msUntilNextAllowed();
    if (wait > 0) await sleep(wait);

    const job = await claimNextJob();
    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    limiter.recordRequest();
    try {
      await processJob(job, { client: clientDeps });
    } catch (err) {
      logger.error({ err, jobId: job.id }, 'Error inesperado procesando job');
    }
  }
}

run().catch((err) => {
  logger.error({ err }, 'El worker terminó con error');
  process.exit(1);
});
