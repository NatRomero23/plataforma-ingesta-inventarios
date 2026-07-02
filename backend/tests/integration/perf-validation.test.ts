import { describe, it, expect } from 'vitest';
import { validateRows, type RawRow } from '../../src/modules/validation/validateRows.js';
import { buildPharmacyLookup } from '../../src/modules/translation/translatePharmacyCode.js';

/**
 * SC-008: la validación local debe procesar al menos ~5,000 renglones/segundo. Prueba DB-free.
 */
describe('Desempeño de validación (T078, SC-008)', () => {
  it('valida ≥ 5,000 renglones/segundo', () => {
    const lookup = buildPharmacyLookup([
      { chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', isActive: true },
    ]);
    const N = 50_000;
    const rows: RawRow[] = Array.from({ length: N }, (_, i) => ({
      rowNumber: i + 2,
      chainPharmacyCode: 'SUC-01',
      ean: '7501234567890',
      productName: `Producto ${i}`,
      stock: i % 100,
    }));

    const start = performance.now();
    const result = validateRows(rows, lookup);
    const elapsedMs = performance.now() - start;

    expect(result.validRows).toBe(N);
    const rowsPerSecond = (N / elapsedMs) * 1000;
    // Umbral holgado para evitar fragilidad en CI; el objetivo de negocio es 5,000/s.
    expect(rowsPerSecond).toBeGreaterThan(5000);
  });
});
