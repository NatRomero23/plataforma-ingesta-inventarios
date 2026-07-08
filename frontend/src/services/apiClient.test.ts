import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listLoads, getToken, setSession, UnauthorizedError } from './apiClient';

/** localStorage en memoria para el entorno de pruebas (Node). */
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

describe('apiClient — manejo de sesión expirada (HTTP 401)', () => {
  beforeEach(() => {
    installLocalStorage();
    setSession('token-viejo', 'ADMIN', 'admin@demo.mx');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('devuelve el arreglo de cargas cuando la respuesta es 200', async () => {
    const rows = [
      { loadId: 'a', origin: 'API', status: 'CONFIRMED', totalRows: 6, validRows: 4, rejectedRows: 1, createdAt: '2026-07-08T15:19:09.740Z' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 })));
    const res = await listLoads({});
    expect(res).toHaveLength(1);
    expect(res[0].loadId).toBe('a');
  });

  // Regresión del bug del Buzón: un 401 (token expirado) NO debe presentarse como "no hay cargas".
  // Debe limpiar la sesión y lanzar UnauthorizedError para que la app redirija al login.
  it('ante 401 lanza UnauthorizedError y limpia el token (no devuelve lista vacía)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(listLoads({})).rejects.toBeInstanceOf(UnauthorizedError);
    expect(getToken()).toBeNull();
  });
});
