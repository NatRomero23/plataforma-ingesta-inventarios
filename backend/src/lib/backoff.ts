/**
 * Backoff exponencial con "full jitter" para reintentos hacia Red Vidar (FR-017, D4).
 * Si la respuesta trae Retry-After, ese valor TIENE PRIORIDAD sobre el backoff calculado.
 */

export interface BackoffOptions {
  baseMs?: number;
  capMs?: number;
  /** Función de aleatoriedad inyectable para pruebas deterministas (default Math.random). */
  random?: () => number;
}

const DEFAULT_BASE_MS = 1000;
const DEFAULT_CAP_MS = 60_000;

/**
 * Calcula el retraso (ms) antes del intento número `attempt` (1-indexado).
 * @param attempt número del intento que falló (1 = primer intento).
 * @param retryAfterMs si viene de la cabecera Retry-After, tiene prioridad.
 */
export function computeBackoffMs(attempt: number, retryAfterMs: number | null, options: BackoffOptions = {}): number {
  if (retryAfterMs !== null && retryAfterMs >= 0) {
    return retryAfterMs;
  }
  const base = options.baseMs ?? DEFAULT_BASE_MS;
  const cap = options.capMs ?? DEFAULT_CAP_MS;
  const random = options.random ?? Math.random;
  const exponential = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  // full jitter: aleatorio en [0, exponential]
  return Math.floor(random() * exponential);
}
