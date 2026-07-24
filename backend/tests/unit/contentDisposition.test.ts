import { describe, it, expect } from 'vitest';
import { safeContentDispositionFilename } from '../../src/modules/loads/contentDisposition.js';

const FALLBACK = 'carga-123';

describe('safeContentDispositionFilename (auditoría #2)', () => {
  it('conserva un nombre de archivo normal', () => {
    expect(safeContentDispositionFilename('inventario.xlsx', FALLBACK)).toBe('inventario.xlsx');
  });

  it('elimina comillas dobles y backslashes que romperían filename="..."', () => {
    expect(safeContentDispositionFilename('a"b\\c.xlsx', FALLBACK)).toBe('abc.xlsx');
  });

  it('elimina CR/LF y control chars (evita inyección de cabeceras)', () => {
    const malicioso = 'archivo".xlsx\r\nSet-Cookie: sesion=robada';
    const saneado = safeContentDispositionFilename(malicioso, FALLBACK);
    expect(saneado).not.toContain('\r');
    expect(saneado).not.toContain('\n');
    expect(saneado).not.toContain('"');
    expect(saneado).toBe('archivo.xlsxSet-Cookie: sesion=robada');
  });

  it('usa el fallback para null, undefined y cadenas vacías', () => {
    expect(safeContentDispositionFilename(null, FALLBACK)).toBe(FALLBACK);
    expect(safeContentDispositionFilename(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeContentDispositionFilename('', FALLBACK)).toBe(FALLBACK);
  });

  it('usa el fallback cuando el nombre queda vacío tras sanear', () => {
    expect(safeContentDispositionFilename('   ', FALLBACK)).toBe(FALLBACK);
    expect(safeContentDispositionFilename('"\\"', FALLBACK)).toBe(FALLBACK);
  });
});
