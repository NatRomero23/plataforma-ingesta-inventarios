// Stub local de la API de Red Vidar para desarrollo. Sin dependencias (Node puro).
// Responde el contrato de la envoltura: { webhookEventId, processingStatus, status, result }.
//
// Uso:  node tools/redvidar-stub.mjs      (o: npm run stub:redvidar desde backend/)
// Escucha en STUB_PORT (default 9999) y atiende cualquier POST a una ruta que termine en /inventory,
// que corresponde a RED_VIDAR_BASE_URL=http://localhost:9999/redvidar del .env del backend.
//
// Simulación de fallos (opcional, para probar reintentos/estados):
//   - Encabezado  X-Sim-Status: 429 | 502 | 422   fuerza ese código en la respuesta.
//   - O define STUB_FORCE_STATUS=429 al arrancar para forzarlo en todas las peticiones.

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.STUB_PORT ?? 9999);
const FORCE_STATUS = process.env.STUB_FORCE_STATUS ? Number(process.env.STUB_FORCE_STATUS) : null;

// Idempotencia: misma X-Idempotency-Key => mismo webhookEventId (no se duplica el "procesamiento").
const seenKeys = new Map();

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/inventory')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Ruta no encontrada (usa POST .../inventory)' }));
    return;
  }

  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const idempotencyKey = req.headers['x-idempotency-key'] ?? '(sin clave)';
    const simStatus = FORCE_STATUS ?? (req.headers['x-sim-status'] ? Number(req.headers['x-sim-status']) : null);

    let body = {};
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      /* cuerpo no JSON */
    }
    const items = Array.isArray(body.items) ? body.items : [];

    // Simulación de errores transitorios / no recuperables.
    if (simStatus === 429) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '2' });
      res.end(JSON.stringify({ message: 'Demasiadas solicitudes (simulado)' }));
      console.log(`[stub] 429 (retry-after 2s)  key=${idempotencyKey}`);
      return;
    }
    if (simStatus === 502 || simStatus === 422 || simStatus === 400 || simStatus === 401) {
      res.writeHead(simStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: `Error simulado ${simStatus}` }));
      console.log(`[stub] ${simStatus} (simulado)  key=${idempotencyKey}`);
      return;
    }

    // Éxito: reusa el webhookEventId por clave de idempotencia.
    let webhookEventId = seenKeys.get(idempotencyKey);
    if (!webhookEventId) {
      webhookEventId = `evt_${randomUUID()}`;
      seenKeys.set(idempotencyKey, webhookEventId);
    }

    // Marca como desconocido cualquier pharmacyCode que no empiece con "RV" (solo demostrativo).
    const unknownPharmacyCodes = [
      ...new Set(items.filter((i) => !String(i.pharmacyCode ?? '').startsWith('RV')).map((i) => String(i.pharmacyCode))),
    ];
    const inserted = items.length - unknownPharmacyCodes.length;

    const envelope = {
      webhookEventId,
      processingStatus: 'processed',
      status: unknownPharmacyCodes.length > 0 ? 'partial' : 'ok',
      result: {
        entriesInserted: inserted,
        medicationsInserted: inserted,
        medicationsUpdated: 0,
        unknownPharmacyCodes,
        errors: [],
      },
    };

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(envelope));
    console.log(
      `[stub] 200 ok  key=${idempotencyKey}  items=${items.length}  inserted=${inserted}  event=${webhookEventId}`,
    );
  });
});

server.listen(PORT, () => {
  console.log(`Stub de Red Vidar escuchando en http://localhost:${PORT}/redvidar/inventory`);
  console.log(FORCE_STATUS ? `(forzando status ${FORCE_STATUS} en todas las peticiones)` : '(respondiendo éxito)');
});
