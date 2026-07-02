import { describe, it, expect } from 'vitest';
import { validateRows, type RawRow } from '../../src/modules/validation/validateRows.js';
import { buildPharmacyLookup } from '../../src/modules/translation/translatePharmacyCode.js';

const lookup = buildPharmacyLookup([
  { chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', isActive: true },
  { chainInternalCode: 'SUC-02', redVidarPharmacyCode: 'RV1002', isActive: true },
]);

function row(partial: Partial<RawRow> & { rowNumber: number }): RawRow {
  return {
    chainPharmacyCode: 'SUC-01',
    ean: '7501234567890',
    productName: 'Paracetamol 500mg',
    stock: 10,
    ...partial,
  };
}

describe('validateRows (T024, FR-004, Principio VIII)', () => {
  it('acepta un renglón válido y lo traduce', () => {
    const r = validateRows([row({ rowNumber: 2 })], lookup);
    expect(r.validRows).toBe(1);
    expect(r.rejectedRows).toBe(0);
    expect(r.rows[0].status).toBe('VALID');
    expect(r.rows[0].redVidarPharmacyCode).toBe('RV1001');
  });

  it('rechaza stock negativo con razón y número de fila', () => {
    const r = validateRows([row({ rowNumber: 5, stock: -3 })], lookup);
    expect(r.validRows).toBe(0);
    expect(r.rejectedRows).toBe(1);
    expect(r.rowErrors).toEqual([{ rowNumber: 5, reason: expect.stringContaining('entero mayor o igual a 0') }]);
  });

  it('rechaza stock no entero', () => {
    const r = validateRows([row({ rowNumber: 6, stock: 2.5 })], lookup);
    expect(r.rejectedRows).toBe(1);
    expect(r.rows[0].rejectionReason).toContain('entero');
  });

  it('rechaza EAN de más de 20 caracteres', () => {
    const r = validateRows([row({ rowNumber: 7, ean: '123456789012345678901' })], lookup);
    expect(r.rejectedRows).toBe(1);
    expect(r.rows[0].rejectionReason).toContain('EAN');
  });

  it('rechaza nombre de producto vacío como campo requerido faltante', () => {
    const r = validateRows([row({ rowNumber: 8, productName: '   ' })], lookup);
    expect(r.rejectedRows).toBe(1);
    expect(r.rows[0].rejectionReason).toContain('nombre del producto');
  });

  it('reporta campos requeridos faltantes', () => {
    const r = validateRows([{ rowNumber: 9, chainPharmacyCode: '', ean: '', productName: '', stock: '' }], lookup);
    expect(r.rejectedRows).toBe(1);
    expect(r.rows[0].rejectionReason).toContain('faltan campos requeridos');
  });

  it('agrupa farmacias no mapeadas aparte de los errores de regla', () => {
    const r = validateRows(
      [row({ rowNumber: 10, chainPharmacyCode: 'SUC-99' }), row({ rowNumber: 11, chainPharmacyCode: 'SUC-99' })],
      lookup,
    );
    expect(r.validRows).toBe(0);
    expect(r.rejectedRows).toBe(0); // los no mapeados no cuentan como error de regla
    expect(r.unmappedPharmacyCount).toBe(2);
    expect(r.unmappedPharmacies).toEqual([{ chainPharmacyCode: 'SUC-99', rowCount: 2 }]);
    expect(r.rowErrors).toHaveLength(0);
  });

  it('separa válidos, errores y no mapeados en un archivo mixto', () => {
    const r = validateRows(
      [
        row({ rowNumber: 2 }), // válido
        row({ rowNumber: 3, stock: -1 }), // error de regla
        row({ rowNumber: 4, chainPharmacyCode: 'SUC-99' }), // no mapeada
      ],
      lookup,
    );
    expect(r.totalRows).toBe(3);
    expect(r.validRows).toBe(1);
    expect(r.rejectedRows).toBe(1);
    expect(r.unmappedPharmacyCount).toBe(1);
  });
});
