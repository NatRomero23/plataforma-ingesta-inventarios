import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import nock from 'nock';
import {
  sendInventory,
  classifyResponse,
  type RedVidarEnvelope,
  type InventoryItem,
} from '../../src/modules/redvidar/redvidarClient.js';

const BASE = 'http://redvidar.test/v1';
const deps = { baseUrl: BASE, apiKey: 'rv_pc_live_TESTKEY' };

const okEnvelope: RedVidarEnvelope = {
  webhookEventId: 'evt_123',
  processingStatus: 'processed',
  status: 'ok',
  result: { entriesInserted: 3, medicationsInserted: 2, medicationsUpdated: 1, unknownPharmacyCodes: [], errors: [] },
};

function items(n = 1): InventoryItem[] {
  return Array.from({ length: n }, (_, i) => ({
    pharmacyCode: `RV100${i}`,
    ean: `750000000000${i}`,
    productName: `Producto ${i}`,
    stock: i + 1,
  }));
}

beforeAll(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

describe('Red Vidar client — contrato (T036, Principio VI)', () => {
  it('caso 1: 2xx con result completo → SUCCESS y envoltura parseada', async () => {
    nock(BASE).post('/inventory').reply(200, okEnvelope);
    const res = await sendInventory({ sourceLabel: 'S', items: items(), idempotencyKey: 'idem-1' }, deps);
    expect(res.outcome).toBe('SUCCESS');
    expect(res.envelope?.webhookEventId).toBe('evt_123');
    expect(res.envelope?.result?.entriesInserted).toBe(3);
  });

  it('caso 2: 2xx con result=null → SUCCESS sin error de parseo', async () => {
    nock(BASE)
      .post('/inventory')
      .reply(200, { webhookEventId: 'evt_2', processingStatus: 'processed', status: 'ok', result: null });
    const res = await sendInventory({ sourceLabel: 'S', items: items(), idempotencyKey: 'idem-2' }, deps);
    expect(res.outcome).toBe('SUCCESS');
    expect(res.envelope?.result ?? null).toBeNull();
  });

  it('caso 3: 2xx con errors[] → SUCCESS_WITH_ERRORS', async () => {
    nock(BASE)
      .post('/inventory')
      .reply(200, {
        webhookEventId: 'evt_3',
        processingStatus: 'processed',
        status: 'partial',
        result: { unknownPharmacyCodes: ['RVX'], errors: [{ row: 2, reason: 'stock inválido' }] },
      });
    const res = await sendInventory({ sourceLabel: 'S', items: items(), idempotencyKey: 'idem-3' }, deps);
    expect(res.outcome).toBe('SUCCESS_WITH_ERRORS');
  });

  it('caso 4: 429 con Retry-After → RETRYABLE con retryAfterMs', async () => {
    nock(BASE).post('/inventory').reply(429, {}, { 'retry-after': '12' });
    const res = await sendInventory({ sourceLabel: 'S', items: items(), idempotencyKey: 'idem-4' }, deps);
    expect(res.outcome).toBe('RETRYABLE');
    expect(res.retryAfterMs).toBe(12000);
  });

  it('caso 5: 502 → RETRYABLE', async () => {
    nock(BASE).post('/inventory').reply(502, 'bad gateway');
    const res = await sendInventory({ sourceLabel: 'S', items: items(), idempotencyKey: 'idem-5' }, deps);
    expect(res.outcome).toBe('RETRYABLE');
  });

  it('caso 6: 422 → NON_RETRYABLE', async () => {
    nock(BASE).post('/inventory').reply(422, { message: 'payload inválido' });
    const res = await sendInventory({ sourceLabel: 'S', items: items(), idempotencyKey: 'idem-6' }, deps);
    expect(res.outcome).toBe('NON_RETRYABLE');
  });

  it('envía el encabezado X-Idempotency-Key con la clave provista', async () => {
    let receivedKey: string | undefined;
    nock(BASE)
      .post('/inventory')
      .reply(function () {
        receivedKey = this.req.headers['x-idempotency-key'] as string;
        return [200, okEnvelope];
      });
    await sendInventory({ sourceLabel: 'S', items: items(), idempotencyKey: 'idem-fixed' }, deps);
    expect(receivedKey).toBe('idem-fixed');
  });

  it('caso 9 (FR-013a): una carga multi-farmacia viaja en UN solo POST con TODOS los renglones y UNA clave', async () => {
    let bodySeen: any;
    let keySeen: string | undefined;
    const scope = nock(BASE)
      .post('/inventory')
      .reply(function (_uri, body) {
        bodySeen = body;
        keySeen = this.req.headers['x-idempotency-key'] as string;
        return [200, okEnvelope];
      });
    // 3 items de farmacias distintas (RV1000, RV1001, RV1002)
    await sendInventory({ sourceLabel: 'S', items: items(3), idempotencyKey: 'idem-multi' }, deps);
    expect(scope.isDone()).toBe(true); // exactamente un POST
    expect(bodySeen.items).toHaveLength(3);
    expect(new Set(bodySeen.items.map((i: InventoryItem) => i.pharmacyCode)).size).toBe(3);
    expect(keySeen).toBe('idem-multi');
  });
});

describe('classifyResponse — ramificación pura por HTTP (FR-017)', () => {
  it('400 y 401 son NON_RETRYABLE', () => {
    expect(classifyResponse(400, null, null).outcome).toBe('NON_RETRYABLE');
    expect(classifyResponse(401, null, null).outcome).toBe('NON_RETRYABLE');
  });
  it('un 2xx sin errores es SUCCESS', () => {
    expect(classifyResponse(201, okEnvelope, null).outcome).toBe('SUCCESS');
  });
  it('otros códigos no esperados son NON_RETRYABLE', () => {
    expect(classifyResponse(418, null, null).outcome).toBe('NON_RETRYABLE');
  });
});
