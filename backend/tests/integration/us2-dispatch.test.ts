import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import nock from 'nock';
import { prisma } from '../../src/lib/prisma.js';
import { processJob } from '../../src/modules/dispatch/dispatchService.js';
import { claimNextJob } from '../../src/modules/queue/dispatchQueue.js';
import { resetDb } from '../helpers/db.js';

/**
 * US2 — Despacho a Red Vidar (T039). Requiere PostgreSQL: RUN_DB_TESTS=1 + DATABASE_URL de prueba migrada.
 * Red Vidar se simula con nock (contrato en contracts/redvidar-client.md).
 */
const runDb = process.env.RUN_DB_TESTS === '1';
const d = runDb ? describe : describe.skip;

const BASE = 'http://redvidar.test/v1';
const clientDeps = { baseUrl: BASE, apiKey: 'rv_pc_live_TESTKEY' };
const okEnvelope = {
  webhookEventId: 'evt_ok',
  processingStatus: 'processed',
  status: 'ok',
  result: { entriesInserted: 1, medicationsInserted: 1, medicationsUpdated: 0, unknownPharmacyCodes: [], errors: [] },
};

async function createQueuedLoad(chainId: string, attempts = 0) {
  const load = await prisma.load.create({
    data: {
      chainId,
      origin: 'PORTAL',
      status: 'QUEUED',
      idempotencyKey: `idem-${Math.floor(performance.now())}-${attempts}`,
      originalBlob: Buffer.from('x'),
      contentType: 'application/octet-stream',
      byteSize: 1,
      totalRows: 1,
      validRows: 1,
      rows: {
        create: [
          {
            rowNumber: 2,
            chainPharmacyCode: 'SUC-01',
            redVidarPharmacyCode: 'RV1001',
            ean: '7501',
            productName: 'Paracetamol',
            stock: 10,
            status: 'VALID',
          },
        ],
      },
    },
  });
  const job = await prisma.dispatchJob.create({ data: { loadId: load.id, attempts } });
  return { load, job: { id: job.id, loadId: load.id, attempts } };
}

d('US2 — despacho a Red Vidar', () => {
  let chainId = '';

  beforeAll(async () => {
    await resetDb();
    const chain = await prisma.chain.create({ data: { name: `Cadena Dispatch ${Date.now()}` } });
    chainId = chain.id;
    nock.disableNetConnect();
  });
  beforeEach(async () => {
    await prisma.redVidarResult.deleteMany();
    await prisma.dispatchAttempt.deleteMany();
    await prisma.dispatchJob.deleteMany();
    await prisma.loadRow.deleteMany();
    await prisma.load.deleteMany();
  });
  afterEach(() => nock.cleanAll());
  afterAll(async () => {
    nock.enableNetConnect();
    await resetDb();
    await prisma.$disconnect();
  });

  it('2xx → CONFIRMED, resultado persistido, job DONE', async () => {
    const { job } = await createQueuedLoad(chainId);
    nock(BASE).post('/inventory').reply(200, okEnvelope);
    await processJob(job, { client: clientDeps });

    const load = await prisma.load.findUnique({ where: { id: job.loadId } });
    expect(load?.status).toBe('CONFIRMED');
    const result = await prisma.redVidarResult.findUnique({ where: { loadId: job.loadId } });
    expect(result?.webhookEventId).toBe('evt_ok');
    const dj = await prisma.dispatchJob.findUnique({ where: { id: job.id } });
    expect(dj?.status).toBe('DONE');
    const attempts = await prisma.dispatchAttempt.count({ where: { loadId: job.loadId } });
    expect(attempts).toBe(1);
  });

  it('2xx con errores por fila → CONFIRMED_WITH_ERRORS', async () => {
    const { job } = await createQueuedLoad(chainId);
    nock(BASE)
      .post('/inventory')
      .reply(200, { ...okEnvelope, result: { errors: [{ row: 2, reason: 'x' }], unknownPharmacyCodes: [] } });
    await processJob(job, { client: clientDeps });
    const load = await prisma.load.findUnique({ where: { id: job.loadId } });
    expect(load?.status).toBe('CONFIRMED_WITH_ERRORS');
  });

  it('422 → FAILED sin reintento, job FAILED', async () => {
    const { job } = await createQueuedLoad(chainId);
    nock(BASE).post('/inventory').reply(422, { message: 'inválido' });
    await processJob(job, { client: clientDeps });
    const load = await prisma.load.findUnique({ where: { id: job.loadId } });
    expect(load?.status).toBe('FAILED');
    const dj = await prisma.dispatchJob.findUnique({ where: { id: job.id } });
    expect(dj?.status).toBe('FAILED');
  });

  it('429 en el 1er intento → job reprogramado (QUEUED) con attempts=1', async () => {
    const { job } = await createQueuedLoad(chainId, 0);
    nock(BASE).post('/inventory').reply(429, {}, { 'retry-after': '1' });
    await processJob(job, { client: clientDeps });
    const dj = await prisma.dispatchJob.findUnique({ where: { id: job.id } });
    expect(dj?.status).toBe('QUEUED');
    expect(dj?.attempts).toBe(1);
    const load = await prisma.load.findUnique({ where: { id: job.loadId } });
    expect(load?.status).toBe('SENT');
  });

  it('502 en el 5º intento (attempts=4) → FAILED por agotar reintentos', async () => {
    const { job } = await createQueuedLoad(chainId, 4);
    nock(BASE).post('/inventory').reply(502, 'bad gateway');
    await processJob(job, { client: clientDeps });
    const dj = await prisma.dispatchJob.findUnique({ where: { id: job.id } });
    expect(dj?.status).toBe('FAILED');
    const load = await prisma.load.findUnique({ where: { id: job.loadId } });
    expect(load?.status).toBe('FAILED');
  });

  // Regresión: la cola quedaba atascada cuando la zona de la sesión de Postgres NO era UTC.
  // availableAt es `timestamp without time zone` (UTC "desnudo"); comparado contra now() (timestamptz),
  // Postgres lo reinterpretaba en la zona de sesión y "availableAt <= now()" daba false para jobs ya vencidos,
  // de modo que claimNextJob() nunca reclamaba nada y el worker quedaba en silencio con las cargas en QUEUED.
  it('claimNextJob reclama un job vencido aunque la sesión NO sea UTC', async () => {
    await prisma.$executeRawUnsafe("SET TIME ZONE 'America/Mexico_City'");
    try {
      const { job } = await createQueuedLoad(chainId);
      // availableAt por defecto es now() al crear: ya está vencido. Debe reclamarse.
      const claimed = await claimNextJob();
      expect(claimed?.id).toBe(job.id);
      const dj = await prisma.dispatchJob.findUnique({ where: { id: job.id } });
      expect(dj?.status).toBe('CLAIMED');
    } finally {
      await prisma.$executeRawUnsafe('SET TIME ZONE DEFAULT');
    }
  });

  it('claimNextJob NO reclama un job cuyo availableAt aún es futuro', async () => {
    const { load } = await createQueuedLoad(chainId);
    const future = new Date(Date.now() + 60_000);
    await prisma.dispatchJob.update({ where: { loadId: load.id }, data: { availableAt: future } });
    const claimed = await claimNextJob();
    expect(claimed).toBeNull();
  });
});
