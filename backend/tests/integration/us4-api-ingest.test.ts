import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { resetDb } from '../helpers/db.js';

/**
 * US4 — Ingesta y consulta por API para integradores (T058/T059/T060).
 * Requiere PostgreSQL: RUN_DB_TESTS=1 + DATABASE_URL de prueba migrada.
 */
const runDb = process.env.RUN_DB_TESTS === '1';
const d = runDb ? describe : describe.skip;

const API_KEY = 'emp_live_TESTKEY0001';

d('US4 — ingesta por API', () => {
  const app = createApp();
  let chainId = '';
  let otherLoadId = '';

  beforeAll(async () => {
    await resetDb();

    const chain = await prisma.chain.create({ data: { name: 'Cadena API' } });
    const other = await prisma.chain.create({ data: { name: 'Otra Cadena' } });
    chainId = chain.id;
    await prisma.pharmacy.create({
      data: { chainId, chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', name: 'Centro' },
    });
    await prisma.apiKey.create({
      data: { chainId, prefix: 'emp_live_', keyHash: await bcrypt.hash(API_KEY, 10), last4: API_KEY.slice(-4) },
    });
    const otherLoad = await prisma.load.create({
      data: {
        chainId: other.id,
        origin: 'API',
        status: 'CONFIRMED',
        originalBlob: Buffer.from('{}'),
        contentType: 'application/json',
        byteSize: 2,
      },
    });
    otherLoadId = otherLoad.id;
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it('T058/T060: valida, traduce y auto-encola los válidos en un solo POST', async () => {
    const res = await request(app)
      .post('/api/v1/integration/inventory')
      .set('X-API-Key', API_KEY)
      .send({
        sourceLabel: 'sistema-cadena',
        items: [
          { pharmacyCode: 'SUC-01', ean: '7501234567890', productName: 'Paracetamol', stock: 10 }, // válido
          { pharmacyCode: 'SUC-01', ean: '7501234567891', productName: 'Ibuprofeno', stock: -1 }, // error
          { pharmacyCode: 'SUC-99', ean: '7501234567892', productName: 'X', stock: 5 }, // no mapeada
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.validRows).toBe(1);
    expect(res.body.rejectedRows).toBe(1);
    expect(res.body.status).toBe('QUEUED'); // auto-encolado (FR-010a)
    expect(res.body.loadId).toBeTruthy();
    const job = await prisma.dispatchJob.findUnique({ where: { loadId: res.body.loadId } });
    expect(job?.status).toBe('QUEUED');
  });

  it('T059: consulta el estado de su carga por identificador', async () => {
    const post = await request(app)
      .post('/api/v1/integration/inventory')
      .set('X-API-Key', API_KEY)
      .send({ sourceLabel: 's', items: [{ pharmacyCode: 'SUC-01', ean: '7501', productName: 'P', stock: 1 }] });
    const res = await request(app).get(`/api/v1/loads/${post.body.loadId}`).set('X-API-Key', API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.loadId).toBe(post.body.loadId);
    expect(res.body.origin).toBe('API');
  });

  it('T059: no puede consultar cargas de otra cadena (403)', async () => {
    const res = await request(app).get(`/api/v1/loads/${otherLoadId}`).set('X-API-Key', API_KEY);
    expect(res.status).toBe(403);
  });

  it('T060: una clave revocada no autentica (401) y no crea carga', async () => {
    await prisma.apiKey.updateMany({ where: { chainId }, data: { status: 'REVOKED', revokedAt: new Date() } });
    const before = await prisma.load.count();
    const res = await request(app)
      .post('/api/v1/integration/inventory')
      .set('X-API-Key', API_KEY)
      .send({ sourceLabel: 's', items: [{ pharmacyCode: 'SUC-01', ean: '7501', productName: 'P', stock: 1 }] });
    expect(res.status).toBe(401);
    expect(await prisma.load.count()).toBe(before);
  });
});
