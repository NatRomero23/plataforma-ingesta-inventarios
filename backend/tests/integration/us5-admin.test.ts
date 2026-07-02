import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { signToken } from '../../src/modules/auth/authService.js';
import { resetDb } from '../helpers/db.js';

/**
 * US5 — Gestión administrativa (T063/T064/T065). Requiere PostgreSQL: RUN_DB_TESTS=1.
 */
const runDb = process.env.RUN_DB_TESTS === '1';
const d = runDb ? describe : describe.skip;

d('US5 — gestión administrativa', () => {
  const app = createApp();
  const adminToken = () => signToken({ sub: 'admin', role: 'ADMIN', chainId: null }, process.env.JWT_SECRET as string);
  const pharmToken = () =>
    signToken({ sub: 'p', role: 'PHARMACY_USER', chainId: 'x' }, process.env.JWT_SECRET as string);

  beforeAll(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it('T063: crea una cadena y rechaza el nombre duplicado (409)', async () => {
    const a = await request(app).post('/api/v1/chains').set('Authorization', `Bearer ${adminToken()}`).send({ name: 'Cadena X' });
    expect(a.status).toBe(201);
    const b = await request(app).post('/api/v1/chains').set('Authorization', `Bearer ${adminToken()}`).send({ name: 'Cadena X' });
    expect(b.status).toBe(409);
  });

  it('T063: agrega farmacias y rechaza código interno duplicado (409)', async () => {
    const chain = await prisma.chain.create({ data: { name: 'Cadena Farmacias' } });
    const p1 = await request(app)
      .post(`/api/v1/chains/${chain.id}/pharmacies`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV1', name: 'Centro' });
    expect(p1.status).toBe(201);
    const p2 = await request(app)
      .post(`/api/v1/chains/${chain.id}/pharmacies`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV2', name: 'Repetida' });
    expect(p2.status).toBe(409);
  });

  it('T063: rechaza un código Red Vidar duplicado en OTRA cadena (unicidad global) con mensaje correcto', async () => {
    const a = await prisma.chain.create({ data: { name: 'Cadena RV A' } });
    const b = await prisma.chain.create({ data: { name: 'Cadena RV B' } });
    const first = await request(app)
      .post(`/api/v1/chains/${a.id}/pharmacies`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV-DUP', name: 'A1' });
    expect(first.status).toBe(201);
    // Mismo código Red Vidar en una cadena distinta => conflicto global, con mensaje específico.
    const dup = await request(app)
      .post(`/api/v1/chains/${b.id}/pharmacies`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ chainInternalCode: 'SUC-09', redVidarPharmacyCode: 'RV-DUP', name: 'B9' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('CODIGO_REDVIDAR_DUPLICADO');
  });

  it('T064: crea usuario con rol válido y rechaza rol API_INTEGRATOR (400)', async () => {
    const chain = await prisma.chain.create({ data: { name: 'Cadena Usuarios' } });
    const ok = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 'coord@x.mx', password: 'password123', role: 'COORDINATOR' });
    expect(ok.status).toBe(201);
    const bad = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 'int@x.mx', password: 'password123', role: 'API_INTEGRATOR', chainId: chain.id });
    expect(bad.status).toBe(400);
  });

  it('T064/T065: generar una clave revoca automáticamente la ACTIVE previa (una activa por cadena) + AuditLog', async () => {
    const chain = await prisma.chain.create({ data: { name: 'Cadena Claves' } });
    const k1 = await request(app).post(`/api/v1/chains/${chain.id}/api-keys`).set('Authorization', `Bearer ${adminToken()}`);
    expect(k1.status).toBe(201);
    expect(k1.body.apiKey).toContain('emp_live_');
    const k2 = await request(app).post(`/api/v1/chains/${chain.id}/api-keys`).set('Authorization', `Bearer ${adminToken()}`);
    expect(k2.status).toBe(201);

    const active = await prisma.apiKey.findMany({ where: { chainId: chain.id, status: 'ACTIVE' } });
    expect(active).toHaveLength(1); // solo la última queda activa
    const auto = await prisma.auditLog.findMany({ where: { action: 'API_KEY_AUTO_REVOKED' } });
    expect(auto.length).toBeGreaterThanOrEqual(1);
  });

  it('T065: revoca una clave y deja de estar activa (204)', async () => {
    const chain = await prisma.chain.create({ data: { name: 'Cadena Revoca' } });
    await request(app).post(`/api/v1/chains/${chain.id}/api-keys`).set('Authorization', `Bearer ${adminToken()}`);
    const active = await prisma.apiKey.findFirst({ where: { chainId: chain.id, status: 'ACTIVE' } });
    const res = await request(app)
      .post(`/api/v1/api-keys/${active?.id}/revoke`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(204);
    const after = await prisma.apiKey.findUnique({ where: { id: active?.id } });
    expect(after?.status).toBe('REVOKED');
  });

  it('T065: un rol no admin no puede gestionar (403)', async () => {
    const res = await request(app).post('/api/v1/chains').set('Authorization', `Bearer ${pharmToken()}`).send({ name: 'Y' });
    expect(res.status).toBe(403);
  });
});
