/**
 * Limitador de ritmo GLOBAL ÚNICO hacia Red Vidar (FR-014, SC-004, D2).
 * Una sola credencial de Red Vidar => una sola cola/limitador compartido por todas las cadenas.
 * Estrategia: espaciar los envíos al menos `minIntervalMs` (10/min => >= 6000 ms), con concurrencia 1
 * en el worker. El reloj es inyectable para pruebas deterministas.
 */

export interface RateLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
}

export class GlobalRateLimiter {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private lastRequestAt: number | null = null;

  constructor(options: RateLimiterOptions = {}) {
    const maxRequests = options.maxRequests ?? 10;
    const windowMs = options.windowMs ?? 60_000;
    this.minIntervalMs = Math.ceil(windowMs / maxRequests);
    this.now = options.now ?? Date.now;
  }

  /** Milisegundos que hay que esperar antes de poder emitir la siguiente solicitud (0 si ya se puede). */
  msUntilNextAllowed(): number {
    if (this.lastRequestAt === null) return 0;
    const elapsed = this.now() - this.lastRequestAt;
    const remaining = this.minIntervalMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  /** Registra que se emitió una solicitud en el instante actual. */
  recordRequest(): void {
    this.lastRequestAt = this.now();
  }

  /** Permite sembrar el último envío (p. ej. al reiniciar el worker, desde DispatchAttempt.finishedAt). */
  seedLastRequest(timestampMs: number): void {
    this.lastRequestAt = timestampMs;
  }
}
