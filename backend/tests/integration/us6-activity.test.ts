import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { signToken } from '../../src/modules/auth/authService.js';
import { resetDb } from '../helpers/db.js';

/**
 * US6 — Actividad por farmacia (T071/T072). Requiere PostgreSQL: RUN_DB_TESTS=1.
 */
const runDb = process.env.RUN_DB_TESTS === '1';
const d = runDb ? describe : describe.skip;

d('US6 — actividad por farmacia', () => {
  const app = createApp();
  const coordToken = () => signToken({ sub: 'c', role: 'COORDINATOR', chainId: null }, process.env.JWT_SECRET as string);
  let chainId = '';

  beforeAll(async () => {
    await resetDb();

    const chain = await prisma.chain.create({ data: { name: 'Cadena Actividad' } });
    chainId = chain.id;
    await prisma.pharmacy.createMany({
      data: [
        { chainId, chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', name: 'Con actividad' },
        { chainId, chainInternalCode: 'SUC-02', redVidarPharmacyCode: 'RV1002', name: 'Sin actividad' },
      ],
    });

    // Carga exitosa con un renglón válido de RV1001.
    await prisma.load.create({
      data: {
        chainId,
        origin: 'PORTAL',
        status: 'CONFIRMED',
        originalBlob: Buffer.from('x'),
        contentType: 'application/octet-stream',
        byteSize: 1,
        rows: {
          create: [
            { rowNumber: 2, chainPharmacyCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', ean: '7501', productName: 'P', stock: 5, status: 'VALID' },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it('T071/T072: muestra la última carga exitosa por farmacia y el caso sin cargas', async () => {
    const res = await request(app).get('/api/v1/pharmacies/activity').set('Authorization', `Bearer ${coordToken()}`);
    expect(res.status).toBe(200);
    const withActivity = res.body.find((p: { redVidarPharmacyCode: string }) => p.redVidarPharmacyCode === 'RV1001');
    const without = res.body.find((p: { redVidarPharmacyCode: string }) => p.redVidarPharmacyCode === 'RV1002');
    expect(withActivity.lastSuccessfulLoadAt).toBeTruthy();
    expect(without.lastSuccessfulLoadAt).toBeNull();
  });
});
