import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import nock from 'nock';
import { redactPaths } from '../../src/lib/logger.js';
import { sendInventory } from '../../src/modules/redvidar/redvidarClient.js';

/**
 * SC-009 / Principio V / FR-030: la credencial de Red Vidar (rv_pc_live_) nunca debe aparecer en respuestas
 * ni logs. Estas verificaciones son DB-free y corren siempre.
 */
const BASE = 'http://redvidar.test/v1';
const SECRET = 'rv_pc_live_SUPERSECRETO';

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());

describe('Seguridad de la credencial de Red Vidar (T077)', () => {
  it('el logger redacta las rutas sensibles (authorization, api-key, RED_VIDAR_API_KEY)', () => {
    expect(redactPaths).toContain('req.headers.authorization');
    expect(redactPaths).toContain('req.headers["x-api-key"]');
    expect(redactPaths).toContain('*.RED_VIDAR_API_KEY');
  });

  it('el cliente envía la credencial SOLO en el encabezado Authorization, nunca en el cuerpo', async () => {
    let bodySeen = '';
    let authHeader: string | undefined;
    nock(BASE)
      .post('/inventory')
      .reply(function (_uri, body) {
        bodySeen = JSON.stringify(body);
        authHeader = this.req.headers['authorization'] as string;
        return [200, { webhookEventId: 'e', processingStatus: 'p', status: 'ok' }];
      });

    const res = await sendInventory(
      { sourceLabel: 'S', items: [{ pharmacyCode: 'RV1', ean: '7501', productName: 'P', stock: 1 }], idempotencyKey: 'k' },
      { baseUrl: BASE, apiKey: SECRET },
    );

    // La credencial no aparece en el cuerpo enviado.
    expect(bodySeen).not.toContain('rv_pc_live_');
    // Viaja en el encabezado (que el logger redacta).
    expect(authHeader).toContain(SECRET);
    // La respuesta clasificada devuelta al resto de la app no contiene la credencial.
    expect(JSON.stringify(res)).not.toContain('rv_pc_live_');
  });
});
