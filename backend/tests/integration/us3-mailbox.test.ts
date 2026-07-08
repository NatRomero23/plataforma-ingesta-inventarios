import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { signToken } from '../../src/modules/auth/authService.js';
import { resetDb } from '../helpers/db.js';

/**
 * US3 — Buzón y detalle para coordinación (T048/T049/T050/T051).
 * Requiere PostgreSQL: RUN_DB_TESTS=1 + DATABASE_URL de prueba migrada.
 */
const runDb = process.env.RUN_DB_TESTS === '1';
const d = runDb ? describe : describe.skip;

d('US3 — buzón', () => {
  const app = createApp();
  let chainA = '';
  let chainB = '';
  let coordToken = '';
  let pharmToken = '';
  let failedLoadA = '';
  let apiLoadA = '';

  beforeAll(async () => {
    await resetDb();

    const a = await prisma.chain.create({ data: { name: 'Cadena A' } });
    const b = await prisma.chain.create({ data: { name: 'Cadena B' } });
    chainA = a.id;
    chainB = b.id;
    await prisma.pharmacy.create({
      data: { chainId: chainA, chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', name: 'Centro A' },
    });

    const pharmUser = await prisma.user.create({
      data: { email: 'farm@a.mx', passwordHash: 'x', role: 'PHARMACY_USER', chainId: chainA },
    });
    coordToken = signToken({ sub: 'coord', role: 'COORDINATOR', chainId: null }, process.env.JWT_SECRET as string);
    pharmToken = signToken({ sub: pharmUser.id, role: 'PHARMACY_USER', chainId: chainA }, process.env.JWT_SECRET as string);

    const mkLoad = (chainId: string, status: any, uploaderUserId: string | null) =>
      prisma.load.create({
        data: {
          chainId,
          origin: 'PORTAL',
          status,
          uploaderUserId,
          originalBlob: Buffer.from('archivo-original'),
          originalFilename: 'inv.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          byteSize: 16,
          totalRows: 2,
          validRows: 1,
          rejectedRows: 1,
          rows: {
            create: [
              { rowNumber: 2, chainPharmacyCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', ean: '7501', productName: 'P', stock: 5, status: 'VALID' },
              { rowNumber: 3, chainPharmacyCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', ean: '7502', productName: 'Q', stock: -1, status: 'REJECTED', rejectionReason: 'stock inválido' },
            ],
          },
          attempts: { create: [{ attemptNumber: 1, outcome: 'NON_RETRYABLE', httpStatus: 422, errorReason: 'inválido' }] },
        },
      });

    const failed = await mkLoad(chainA, 'FAILED', pharmUser.id);
    failedLoadA = failed.id;
    await mkLoad(chainA, 'CONFIRMED', pharmUser.id);
    await mkLoad(chainB, 'FAILED', null);

    // Carga de origen API en la MISMA cadena del usuario-farmacia (sin uploaderUserId): el
    // usuario-farmacia NO debe verla; solo admin/coordinador la ven en el Buzón.
    const apiLoad = await prisma.load.create({
      data: {
        chainId: chainA,
        origin: 'API',
        status: 'CONFIRMED',
        uploaderUserId: null,
        originalBlob: Buffer.from('{"items":[]}'),
        contentType: 'application/json',
        byteSize: 12,
        totalRows: 3,
        validRows: 3,
        rejectedRows: 0,
      },
    });
    apiLoadA = apiLoad.id;
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it('T048: coordinación filtra por cadena y estado', async () => {
    const res = await request(app)
      .get('/api/v1/loads')
      .query({ chainId: chainA, status: 'FAILED' })
      .set('Authorization', `Bearer ${coordToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].loadId).toBe(failedLoadA);
  });

  it('T049: detalle de carga con conteos, intentos y quién la subió', async () => {
    const res = await request(app).get(`/api/v1/loads/${failedLoadA}`).set('Authorization', `Bearer ${coordToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('FAILED');
    expect(res.body.validRows).toBe(1);
    expect(res.body.rejectedDetail).toHaveLength(1);
    expect(res.body.attempts[0].httpStatus).toBe(422);
    expect(res.body.uploadedBy).toBe('farm@a.mx');
  });

  it('T050: descarga del archivo original', async () => {
    const res = await request(app)
      .get(`/api/v1/loads/${failedLoadA}/original`)
      .set('Authorization', `Bearer ${coordToken}`)
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('inv.xlsx');
    expect((res.body as Buffer).toString()).toBe('archivo-original');
  });

  it('T051: usuario-farmacia solo ve las cargas de su propia cadena', async () => {
    const res = await request(app).get('/api/v1/loads').set('Authorization', `Bearer ${pharmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every((l: { chainId: string }) => l.chainId === chainA)).toBe(true);
  });

  it('T051c: usuario-farmacia solo ve SUS cargas del portal, NO las de origen API de su cadena', async () => {
    const res = await request(app).get('/api/v1/loads').set('Authorization', `Bearer ${pharmToken}`);
    expect(res.status).toBe(200);
    // Solo sus dos cargas del portal; ninguna de origen API.
    expect(res.body).toHaveLength(2);
    expect(res.body.every((l: { origin: string }) => l.origin === 'PORTAL')).toBe(true);
    // La carga API de su cadena existe pero no es visible para él.
    expect(res.body.some((l: { loadId: string }) => l.loadId === apiLoadA)).toBe(false);
  });

  it('T051d: admin/coordinador SÍ ven las cargas de origen API en el Buzón', async () => {
    const res = await request(app)
      .get('/api/v1/loads')
      .query({ chainId: chainA })
      .set('Authorization', `Bearer ${coordToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((l: { loadId: string }) => l.loadId === apiLoadA)).toBe(true);
  });

  it('T051: usuario-farmacia no puede ver el detalle de otra cadena (403)', async () => {
    const otherChainLoad = await prisma.load.findFirst({ where: { chainId: chainB } });
    const res = await request(app)
      .get(`/api/v1/loads/${otherChainLoad?.id}`)
      .set('Authorization', `Bearer ${pharmToken}`);
    expect(res.status).toBe(403);
  });
});
