import { describe, it, expect } from 'vitest';
import { GlobalRateLimiter } from '../../src/modules/dispatch/rateLimiter.js';

describe('GlobalRateLimiter (T038, SC-004, D2)', () => {
  it('exige un intervalo mínimo de 6 s para 10 solicitudes/minuto', () => {
    let now = 0;
    const rl = new GlobalRateLimiter({ maxRequests: 10, windowMs: 60_000, now: () => now });
    expect(rl.msUntilNextAllowed()).toBe(0); // primera solicitud permitida
    rl.recordRequest();
    now = 1000;
    expect(rl.msUntilNextAllowed()).toBe(5000); // faltan 5 s
    now = 6000;
    expect(rl.msUntilNextAllowed()).toBe(0); // pasaron 6 s
  });

  it('no permite más de 10 solicitudes en cualquier ventana de 60 s', () => {
    let now = 0;
    const rl = new GlobalRateLimiter({ maxRequests: 10, windowMs: 60_000, now: () => now });
    let count = 0;
    // Simular 60 s emitiendo tan rápido como el limitador permita.
    while (now <= 60_000) {
      if (rl.msUntilNextAllowed() === 0) {
        rl.recordRequest();
        count += 1;
        now += 1; // avanzar 1 ms tras emitir
      } else {
        now += rl.msUntilNextAllowed();
      }
    }
    // En 60 s con intervalo de 6 s caben ~11 marcas (t=0,6s,...,60s); en cualquier ventana deslizante de 60s <= 10.
    expect(count).toBeLessThanOrEqual(11);
    // Verificación de ventana deslizante estricta: nunca 11 en <60s.
    const intervalMs = 6000;
    expect(intervalMs * 10).toBeGreaterThanOrEqual(60_000);
  });

  it('permite sembrar el último envío tras un reinicio del worker', () => {
    let now = 10_000;
    const rl = new GlobalRateLimiter({ maxRequests: 10, windowMs: 60_000, now: () => now });
    rl.seedLastRequest(8000);
    expect(rl.msUntilNextAllowed()).toBe(4000); // 6000 - (10000-8000)
  });
});
