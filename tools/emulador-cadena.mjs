// Emulador del sistema de una cadena de farmacias integradora (US4, canal API).
// Node puro, sin dependencias. Simula de punta a punta: autenticar, enviar inventario
// por el contrato espejo, leer la validación y seguir el estado de la carga hasta que
// llegue a un estado terminal (confirmada / fallida), mostrando el webhookEventId de Red Vidar.
//
// ─────────────────────────────────────────────────────────────────────────────
// USO
//   node tools/emulador-cadena.mjs
//   npm run emulador                    (desde backend/)
//
// Requiere Node 20+ (usa fetch global). La plataforma debe estar corriendo:
//   backend (API en :3001) + worker de despacho + stub de Red Vidar + seed cargado.
//
// CONFIGURACIÓN (variables de entorno o argumentos; el argumento gana):
//   PLATFORM_API_KEY   / --key=<clave>     Clave de API de la cadena.  Default: emp_live_DEMOKEY0001 (seed)
//   PLATFORM_BASE_URL  / --url=<url>       Base de la API.             Default: http://localhost:3001
//   EMU_POLL_MS        / --poll=<ms>       Intervalo de sondeo.        Default: 2000
//   EMU_TIMEOUT_MS     / --timeout=<ms>    Tope de espera total.       Default: 90000
//
// Ejemplos:
//   node tools/emulador-cadena.mjs --key=emp_live_OTRACLAVE
//   PLATFORM_BASE_URL=http://localhost:3001 npm run emulador --prefix backend
// ─────────────────────────────────────────────────────────────────────────────

// ---------- Configuración ----------
function arg(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

const API_KEY = arg('key') ?? process.env.PLATFORM_API_KEY ?? 'emp_live_DEMOKEY0001';
const BASE_URL = (arg('url') ?? process.env.PLATFORM_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const POLL_MS = Number(arg('poll') ?? process.env.EMU_POLL_MS ?? 2000);
const TIMEOUT_MS = Number(arg('timeout') ?? process.env.EMU_TIMEOUT_MS ?? 90000);

const TERMINAL = new Set(['CONFIRMED', 'CONFIRMED_WITH_ERRORS', 'FAILED']);
const STATUS_ES = {
  RECEIVED: 'recibida',
  VALIDATED: 'validada',
  QUEUED: 'en cola',
  SENT: 'enviada',
  CONFIRMED: 'confirmada',
  CONFIRMED_WITH_ERRORS: 'confirmada con errores',
  FAILED: 'fallida',
};

// ---------- Inventario simulado (contrato espejo de Red Vidar) ----------
// pharmacyCode = código INTERNO de la cadena (la plataforma lo traduce a Red Vidar).
//   SUC-01, SUC-02  → mapeadas en el seed (RV1001 / RV1002) → válidas
//   SUC-99          → NO existe en la cadena → caso "no mapeada"
//   fila con stock inválido → caso "error de validación por renglón"
const items = [
  { pharmacyCode: 'SUC-01', ean: '7501000000011', productName: 'Paracetamol 500mg 20 tabs', stock: 120 },
  { pharmacyCode: 'SUC-01', ean: '7501000000028', productName: 'Ibuprofeno 400mg 30 tabs', stock: 45 },
  { pharmacyCode: 'SUC-02', ean: '7501000000035', productName: 'Amoxicilina 500mg 12 caps', stock: 0 },
  { pharmacyCode: 'SUC-02', ean: '7501000000042', productName: 'Omeprazol 20mg 14 caps', stock: 300 },
  { pharmacyCode: 'SUC-99', ean: '7501000000059', productName: 'Loratadina 10mg 10 tabs', stock: 15 }, // no mapeada
  { pharmacyCode: 'SUC-02', ean: '7501000000066', productName: 'Naproxeno 250mg 20 tabs', stock: -5 }, // stock inválido
];

// ---------- Utilidades de presentación ----------
const line = (c = '─') => c.repeat(72);
const now = () => new Date().toLocaleTimeString('es-MX');
function title(text) {
  console.log(`\n${line('═')}\n  ${text}\n${line('═')}`);
}
function short(key) {
  if (!key) return '(sin clave)';
  const s = String(key);
  return s.length <= 12 ? s : `${s.slice(0, 8)}…${s.slice(-4)}`;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'X-API-Key': API_KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Flujo principal ----------
async function main() {
  title('EMULADOR DE CADENA — canal API (US4)');
  console.log(`  Plataforma : ${BASE_URL}`);
  console.log(`  Clave API  : ${short(API_KEY)}`);
  console.log(`  Sondeo     : cada ${POLL_MS} ms (tope ${Math.round(TIMEOUT_MS / 1000)} s)`);

  const sourceLabel = `Emulador cadena — ${new Date().toISOString()}`;

  // 1) Envío del inventario ---------------------------------------------------
  title('1) ENVÍO DE INVENTARIO  →  POST /api/v1/integration/inventory');
  console.log(`  sourceLabel: ${sourceLabel}`);
  console.log(`  items: ${items.length}`);
  console.table(
    items.map((it) => ({
      pharmacyCode: it.pharmacyCode,
      ean: it.ean,
      producto: it.productName,
      stock: it.stock,
    })),
  );

  let sent;
  try {
    sent = await api('/api/v1/integration/inventory', { method: 'POST', body: { sourceLabel, items } });
  } catch (err) {
    console.error(`\n✗ No se pudo contactar la plataforma en ${BASE_URL}.`);
    console.error(`  ¿Está corriendo el backend? Detalle: ${err.message}`);
    process.exit(1);
  }

  if (!sent.ok) {
    console.error(`\n✗ La plataforma rechazó el envío (HTTP ${sent.status}).`);
    console.error(`  ${JSON.stringify(sent.data)}`);
    if (sent.status === 401) console.error('  Revisa la clave de API (¿corriste el seed? ¿es la clave correcta?).');
    process.exit(1);
  }

  const summary = sent.data;

  // 2) Respuesta de validación -----------------------------------------------
  title('2) RESPUESTA DE VALIDACIÓN');
  console.log(`  loadId : ${summary.loadId}`);
  console.log(`  estado : ${summary.status} (${STATUS_ES[summary.status] ?? summary.status})`);
  console.log(`  ${line()}`);
  console.log(`  Total de renglones : ${summary.totalRows}`);
  console.log(`  ✓ Válidos          : ${summary.validRows}`);
  console.log(`  ✗ Con error        : ${summary.rejectedRows}`);

  if (summary.rowErrors?.length) {
    console.log(`\n  Errores por renglón:`);
    for (const e of summary.rowErrors) console.log(`    • Fila ${e.rowNumber}: ${e.reason}`);
  }
  if (summary.unmappedPharmacies?.length) {
    console.log(`\n  Farmacias NO mapeadas (no se enviarán a Red Vidar):`);
    for (const u of summary.unmappedPharmacies) {
      console.log(`    • ${u.chainPharmacyCode} — ${u.rowCount} renglón(es)`);
    }
  }

  if (summary.validRows === 0) {
    console.log('\n  No hay renglones válidos que enviar; no habrá despacho. Fin.');
    return;
  }

  // 3) Seguimiento del estado hasta terminal ----------------------------------
  title('3) SEGUIMIENTO DE ESTADO  →  GET /api/v1/loads/:loadId');
  console.log('  Los válidos se auto-encolan; el worker despacha a Red Vidar con control de ritmo.\n');

  const started = Date.now();
  let last = null;
  let finalDetail = null;

  while (Date.now() - started < TIMEOUT_MS) {
    const poll = await api(`/api/v1/loads/${summary.loadId}`);
    if (!poll.ok) {
      console.log(`  [${now()}] no se pudo leer el estado (HTTP ${poll.status}); reintentando…`);
      await sleep(POLL_MS);
      continue;
    }
    const d = poll.data;
    if (d.status !== last) {
      const attempts = d.attempts?.length ?? 0;
      console.log(
        `  [${now()}] estado → ${d.status} (${STATUS_ES[d.status] ?? d.status})` +
          (attempts ? `  · intentos: ${attempts}` : ''),
      );
      last = d.status;
    }
    if (TERMINAL.has(d.status)) {
      finalDetail = d;
      break;
    }
    await sleep(POLL_MS);
  }

  // 4) Resultado final --------------------------------------------------------
  title('4) RESULTADO FINAL');
  if (!finalDetail) {
    console.log(`  ⏱ La carga no alcanzó un estado terminal en ${Math.round(TIMEOUT_MS / 1000)} s.`);
    console.log('  ¿Están corriendo el worker y el stub de Red Vidar? (npm run worker / npm run stub:redvidar)');
    process.exit(2);
  }

  const okStatuses = new Set(['CONFIRMED', 'CONFIRMED_WITH_ERRORS']);
  const mark = okStatuses.has(finalDetail.status) ? '✓' : '✗';
  console.log(`  ${mark} Estado final: ${finalDetail.status} (${STATUS_ES[finalDetail.status] ?? finalDetail.status})`);

  const rv = finalDetail.redVidarResult;
  if (rv) {
    console.log(`  ${line()}`);
    console.log(`  webhookEventId (Red Vidar) : ${rv.webhookEventId}`);
    console.log(`  Renglones insertados       : ${rv.entriesInserted ?? '—'}`);
    console.log(`  Medicamentos insertados    : ${rv.medicationsInserted ?? '—'}`);
    console.log(`  Medicamentos actualizados  : ${rv.medicationsUpdated ?? '—'}`);
    console.log(`  Códigos desconocidos       : ${rv.unknownPharmacyCodes?.join(', ') || '—'}`);
  } else {
    console.log('  (Sin resultado de Red Vidar registrado.)');
  }

  const attempts = finalDetail.attempts ?? [];
  if (attempts.length) {
    console.log(`\n  Intentos de envío (${attempts.length}):`);
    for (const a of attempts) {
      const when = a.finishedAt ? new Date(a.finishedAt).toLocaleTimeString('es-MX') : '—';
      const parts = [
        `#${a.attemptNumber}`,
        `HTTP ${a.httpStatus ?? '—'}`,
        a.webhookEventId ? `event ${a.webhookEventId}` : null,
        `fin ${when}`,
        a.errorReason ? `error: ${a.errorReason}` : null,
      ].filter(Boolean);
      console.log(`    • ${parts.join('  ·  ')}`);
    }
  }
  console.log(`\n${line('═')}\n`);
}

main().catch((err) => {
  console.error('\n✗ Error inesperado en el emulador:', err);
  process.exit(1);
});
