// Stub local de la API de Red Vidar para desarrollo. Sin dependencias (Node puro).
// Responde el contrato de la envoltura: { webhookEventId, processingStatus, status, result }.
//
// Uso:  node tools/redvidar-stub.mjs      (o: npm run stub:redvidar desde backend/)
// Escucha en STUB_PORT (default 9999) y atiende cualquier POST a una ruta que termine en /inventory,
// que corresponde a RED_VIDAR_BASE_URL=http://localhost:9999/redvidar del .env del backend.
//
// Imprime cada solicitud recibida de forma legible para demo: hora, endpoint, cuántos items llegaron y
// de qué pharmacyCodes, la X-Idempotency-Key (truncada) y el webhookEventId respondido. Cuando reconoce
// una clave ya vista, lo marca claramente como REINTENTO IDEMPOTENTE (mismo webhookEventId, sin reprocesar).
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
let requestSeq = 0;

// ---------- Utilidades de presentación ----------
const hora = () => new Date().toLocaleTimeString('es-MX');
function shortKey(key) {
  if (!key || key === '(sin clave)') return '(sin clave)';
  const s = String(key);
  return s.length <= 12 ? s : `${s.slice(0, 8)}…${s.slice(-4)}`;
}
/** Resume los pharmacyCodes con su conteo, p. ej. "RV1001×2, RV1002×1". */
function resumenCodigos(items) {
  const counter = new Map();
  for (const it of items) {
    const code = String(it.pharmacyCode ?? '(vacío)');
    counter.set(code, (counter.get(code) ?? 0) + 1);
  }
  return [...counter.entries()].map(([code, n]) => `${code}×${n}`).join(', ') || '(sin items)';
}
function encabezado(seq, endpoint, items, idempotencyKey) {
  console.log('┌' + '─'.repeat(70));
  console.log(`│ #${seq}  [${hora()}]  POST ${endpoint}`);
  console.log(`│ items: ${items.length}  ·  pharmacyCodes: ${resumenCodigos(items)}`);
  console.log(`│ X-Idempotency-Key: ${shortKey(idempotencyKey)}`);
}
function pie(mensaje) {
  console.log(`│ ${mensaje}`);
  console.log('└' + '─'.repeat(70));
}

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

    const seq = ++requestSeq;
    encabezado(seq, req.url, items, idempotencyKey);

    // Simulación de errores transitorios / no recuperables.
    if (simStatus === 429) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '2' });
      res.end(JSON.stringify({ message: 'Demasiadas solicitudes (simulado)' }));
      pie('↺ 429 SIMULADO (retry-after 2s) — el backend debería reintentar con backoff');
      return;
    }
    if (simStatus === 502 || simStatus === 422 || simStatus === 400 || simStatus === 401) {
      res.writeHead(simStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: `Error simulado ${simStatus}` }));
      pie(`✗ ${simStatus} SIMULADO`);
      return;
    }

    // Éxito: reusa el webhookEventId por clave de idempotencia.
    const isRetry = seenKeys.has(idempotencyKey);
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

    if (isRetry) {
      pie(
        `♻ REINTENTO IDEMPOTENTE reconocido — mismo webhookEventId, NO se reprocesa` +
          `\n│ 200 ${envelope.status}  ·  event=${webhookEventId}  ·  insertados=${inserted}` +
          (unknownPharmacyCodes.length ? `  ·  desconocidos=${unknownPharmacyCodes.join(', ')}` : ''),
      );
    } else {
      pie(
        `✓ 200 ${envelope.status} (nueva)  ·  event=${webhookEventId}  ·  insertados=${inserted}` +
          (unknownPharmacyCodes.length ? `  ·  desconocidos=${unknownPharmacyCodes.join(', ')}` : ''),
      );
    }
  });
});

server.listen(PORT, () => {
  console.log(`Stub de Red Vidar escuchando en http://localhost:${PORT}/redvidar/inventory`);
  console.log(FORCE_STATUS ? `(forzando status ${FORCE_STATUS} en todas las peticiones)` : '(respondiendo éxito)');
  console.log('Esperando solicitudes…\n');
});
