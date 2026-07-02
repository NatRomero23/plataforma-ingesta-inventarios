import http from 'node:http';
import https from 'node:https';
import { z } from 'zod';

/**
 * Cliente hacia la API de Red Vidar (contrato externo obligatorio, Principio VI).
 * - Envía UN POST por carga con X-Idempotency-Key (FR-013a/FR-015).
 * - Deserializa la envoltura con `result` opcional/nullable (FR-016).
 * - `classifyResponse` es pura y ramifica por código HTTP (FR-017) — testeable sin red.
 * La credencial (rv_pc_live_) se pasa por parámetro desde config; nunca se registra ni se reexpone.
 */

// Envoltura de respuesta de Red Vidar. `result` es opcional y puede ser null.
export const redVidarResultSchema = z
  .object({
    entriesInserted: z.number().int().nullish(),
    medicationsInserted: z.number().int().nullish(),
    medicationsUpdated: z.number().int().nullish(),
    unknownPharmacyCodes: z.array(z.string()).nullish(),
    errors: z.array(z.object({ row: z.number().int().nullish(), reason: z.string() })).nullish(),
  })
  .passthrough();

export const redVidarEnvelopeSchema = z.object({
  webhookEventId: z.string(),
  processingStatus: z.string(),
  status: z.string(),
  result: redVidarResultSchema.nullish(),
});

export type RedVidarEnvelope = z.infer<typeof redVidarEnvelopeSchema>;

export interface InventoryItem {
  pharmacyCode: string; // código Red Vidar ya traducido
  ean: string;
  productName: string;
  stock: number;
}

export interface SendInventoryInput {
  sourceLabel: string;
  items: InventoryItem[];
  idempotencyKey: string;
}

export type DispatchOutcome = 'SUCCESS' | 'SUCCESS_WITH_ERRORS' | 'RETRYABLE' | 'NON_RETRYABLE';

export interface ClassifiedResponse {
  outcome: DispatchOutcome;
  httpStatus: number;
  envelope: RedVidarEnvelope | null;
  retryAfterMs: number | null;
  errorReason: string | null;
}

/**
 * Ramificación pura por estado HTTP (FR-017):
 * 2xx -> SUCCESS / SUCCESS_WITH_ERRORS; 400/401/422 -> NON_RETRYABLE; 429/502 -> RETRYABLE; otros -> NON_RETRYABLE.
 */
export function classifyResponse(
  httpStatus: number,
  envelope: RedVidarEnvelope | null,
  retryAfterMs: number | null,
): ClassifiedResponse {
  if (httpStatus >= 200 && httpStatus < 300) {
    const result = envelope?.result;
    const hasErrors = !!result && ((result.errors?.length ?? 0) > 0 || (result.unknownPharmacyCodes?.length ?? 0) > 0);
    return {
      outcome: hasErrors ? 'SUCCESS_WITH_ERRORS' : 'SUCCESS',
      httpStatus,
      envelope,
      retryAfterMs: null,
      errorReason: null,
    };
  }

  if (httpStatus === 400 || httpStatus === 401 || httpStatus === 422) {
    return {
      outcome: 'NON_RETRYABLE',
      httpStatus,
      envelope,
      retryAfterMs: null,
      errorReason: `Red Vidar respondió ${httpStatus} (no recuperable, requiere corrección)`,
    };
  }

  if (httpStatus === 429 || httpStatus === 502) {
    return {
      outcome: 'RETRYABLE',
      httpStatus,
      envelope,
      retryAfterMs,
      errorReason: `Red Vidar respondió ${httpStatus} (transitorio)`,
    };
  }

  return {
    outcome: 'NON_RETRYABLE',
    httpStatus,
    envelope,
    retryAfterMs: null,
    errorReason: `Red Vidar respondió ${httpStatus} (no esperado)`,
  };
}

function parseRetryAfterMs(headerValue: string | undefined): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

export interface RawHttpResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** POST JSON usando node:http/https (interceptable por nock). Inyectable para pruebas. */
export function httpPostJson(url: string, headers: Record<string, string>, body: string): Promise<RawHttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        method: 'POST',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, body: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export interface RedVidarClientDeps {
  baseUrl: string;
  apiKey: string;
  post?: typeof httpPostJson;
}

/**
 * Envía una carga a Red Vidar y devuelve la respuesta clasificada.
 * Lanza en errores de red/timeout para que el despachador los trate como transitorios (RETRYABLE).
 */
export async function sendInventory(input: SendInventoryInput, deps: RedVidarClientDeps): Promise<ClassifiedResponse> {
  const post = deps.post ?? httpPostJson;
  const url = `${deps.baseUrl.replace(/\/$/, '')}/inventory`;
  const payload = JSON.stringify({
    sourceLabel: input.sourceLabel,
    items: input.items,
  });
  const raw = await post(
    url,
    {
      // La credencial de Red Vidar viaja solo en este encabezado; nunca se loguea (redacción).
      authorization: `Bearer ${deps.apiKey}`,
      'x-idempotency-key': input.idempotencyKey,
    },
    payload,
  );

  let envelope: RedVidarEnvelope | null = null;
  if (raw.body) {
    try {
      envelope = redVidarEnvelopeSchema.parse(JSON.parse(raw.body));
    } catch {
      envelope = null; // cuerpo no conforme; el estado se deriva del HTTP
    }
  }
  const retryAfterHeader = raw.headers['retry-after'];
  const retryAfterMs = parseRetryAfterMs(Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader);
  return classifyResponse(raw.statusCode, envelope, retryAfterMs);
}
