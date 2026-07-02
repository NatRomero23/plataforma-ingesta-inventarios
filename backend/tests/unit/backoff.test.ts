import { describe, it, expect } from 'vitest';
import { computeBackoffMs } from '../../src/lib/backoff.js';

describe('computeBackoffMs (T037, D4)', () => {
  it('da prioridad a Retry-After sobre el backoff calculado', () => {
    expect(computeBackoffMs(1, 5000, { random: () => 1 })).toBe(5000);
    expect(computeBackoffMs(3, 12000, { random: () => 0.5 })).toBe(12000);
  });

  it('crece exponencialmente con el número de intento (con jitter máximo)', () => {
    const opts = { baseMs: 1000, capMs: 60000, random: () => 1 }; // random=1 => tope del rango
    expect(computeBackoffMs(1, null, opts)).toBe(1000); // 1000 * 2^0
    expect(computeBackoffMs(2, null, opts)).toBe(2000); // 1000 * 2^1
    expect(computeBackoffMs(3, null, opts)).toBe(4000); // 1000 * 2^2
  });

  it('aplica full jitter (aleatorio dentro del rango)', () => {
    const opts = { baseMs: 1000, capMs: 60000, random: () => 0.5 };
    expect(computeBackoffMs(3, null, opts)).toBe(2000); // 0.5 * 4000
  });

  it('respeta el techo (cap)', () => {
    const opts = { baseMs: 1000, capMs: 3000, random: () => 1 };
    expect(computeBackoffMs(10, null, opts)).toBe(3000);
  });
});
