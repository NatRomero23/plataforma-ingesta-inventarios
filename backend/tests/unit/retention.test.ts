import { describe, it, expect } from 'vitest';
import { retentionAction } from '../../src/modules/loads/retentionService.js';

describe('retentionAction (T076, FR-022a)', () => {
  const now = new Date('2026-07-02T00:00:00Z');
  const old = new Date('2020-01-01T00:00:00Z');
  const recent = new Date('2026-07-01T00:00:00Z');

  it('INDEFINITE nunca actúa (nada se descarta por defecto)', () => {
    expect(retentionAction({ mode: 'INDEFINITE', afterDays: null }, 'CONFIRMED', old, now)).toBe('NONE');
  });

  it('no actúa sobre cargas en estado no terminal', () => {
    expect(retentionAction({ mode: 'PURGE_AFTER', afterDays: 30 }, 'QUEUED', old, now)).toBe('NONE');
  });

  it('no actúa si la carga es más reciente que afterDays', () => {
    expect(retentionAction({ mode: 'ARCHIVE_AFTER', afterDays: 30 }, 'CONFIRMED', recent, now)).toBe('NONE');
  });

  it('archiva cargas terminales antiguas con ARCHIVE_AFTER', () => {
    expect(retentionAction({ mode: 'ARCHIVE_AFTER', afterDays: 30 }, 'CONFIRMED', old, now)).toBe('ARCHIVE');
  });

  it('purga cargas terminales antiguas con PURGE_AFTER', () => {
    expect(retentionAction({ mode: 'PURGE_AFTER', afterDays: 30 }, 'FAILED', old, now)).toBe('PURGE');
  });
});
