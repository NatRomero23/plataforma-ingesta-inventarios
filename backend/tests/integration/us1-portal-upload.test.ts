import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { signToken } from '../../src/modules/auth/authService.js';
import { resetDb } from '../helpers/db.js';

/**
 * US1 — Carga por portal con validación previa (T021/T022/T023/T026).
 * Requiere PostgreSQL. Ejecutar con: RUN_DB_TESTS=1 y DATABASE_URL apuntando a una BD de prueba migrada.
 */
const runDb = process.env.RUN_DB_TESTS === '1';
const d = runDb ? describe : describe.skip;

async function buildXlsx(rows: Array<[string, string, string, string | number]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Inventario');
  sheet.addRow(['Código de farmacia', 'EAN', 'Nombre del producto', 'Stock']);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function buildXlsxMissingColumn(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Inventario');
  sheet.addRow(['Código de farmacia', 'EAN', 'Nombre del producto']); // falta Stock
  sheet.addRow(['SUC-01', '7501', 'Producto']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

d('US1 — carga por portal', () => {
  const app = createApp();
  let token = '';
  let chainId = '';

  beforeAll(async () => {
    await resetDb();

    const chain = await prisma.chain.create({ data: { name: 'Cadena Test' } });
    chainId = chain.id;
    await prisma.pharmacy.createMany({
      data: [
        { chainId, chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', name: 'Centro' },
        { chainId, chainInternalCode: 'SUC-02', redVidarPharmacyCode: null, name: 'Sin mapear' },
      ],
    });
    const user = await prisma.user.create({
      data: { email: 'u@test.mx', passwordHash: 'x', role: 'PHARMACY_USER', chainId },
    });
    token = signToken({ sub: user.id, role: 'PHARMACY_USER', chainId }, process.env.JWT_SECRET as string);
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it('T021: descarga la plantilla de Excel', async () => {
    const res = await request(app).get('/api/v1/inventory/template').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  it('T022/T026: sube un archivo mixto y devuelve el resumen de validación', async () => {
    const file = await buildXlsx([
      ['SUC-01', '7501234567890', 'Paracetamol', 10], // válido
      ['SUC-01', '7501234567891', 'Ibuprofeno', -3], // error de regla
      ['SUC-02', '7501234567892', 'Amoxicilina', 5], // farmacia no mapeada
    ]);
    const res = await request(app)
      .post('/api/v1/inventory/portal-uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, 'inv.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.validRows).toBe(1);
    expect(res.body.rejectedRows).toBe(1);
    expect(res.body.rowErrors[0].reason).toContain('entero mayor o igual a 0');
    expect(res.body.unmappedPharmacies[0].chainPharmacyCode).toBe('SUC-02');
    expect(res.body.status).toBe('VALIDATED');
  });

  it('T022: rechaza un archivo sin columnas requeridas', async () => {
    const file = await buildXlsxMissingColumn();
    const res = await request(app)
      .post('/api/v1/inventory/portal-uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, 'inv.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COLUMNAS_FALTANTES');
  });

  it('T023: confirma una carga con válidos (VALIDATED → QUEUED)', async () => {
    const file = await buildXlsx([['SUC-01', '7501234567890', 'Paracetamol', 10]]);
    const up = await request(app)
      .post('/api/v1/inventory/portal-uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, 'inv.xlsx');
    const confirm = await request(app)
      .post(`/api/v1/loads/${up.body.loadId}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirm.status).toBe(202);
    const job = await prisma.dispatchJob.findUnique({ where: { loadId: up.body.loadId } });
    expect(job?.status).toBe('QUEUED');
    const load = await prisma.load.findUnique({ where: { id: up.body.loadId } });
    expect(load?.status).toBe('QUEUED');
    expect(load?.idempotencyKey).toBeTruthy();
  });

  it('T023: rechaza confirmar una carga sin renglones válidos (FR-007)', async () => {
    const file = await buildXlsx([['SUC-02', '7501234567892', 'Amoxicilina', 5]]); // no mapeada => 0 válidos
    const up = await request(app)
      .post('/api/v1/inventory/portal-uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, 'inv.xlsx');
    const confirm = await request(app)
      .post(`/api/v1/loads/${up.body.loadId}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirm.status).toBe(409);
    expect(confirm.body.code).toBe('SIN_RENGLONES_VALIDOS');
  });
});
