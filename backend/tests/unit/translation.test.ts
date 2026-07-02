import { describe, it, expect } from 'vitest';
import { buildPharmacyLookup, translatePharmacyCode } from '../../src/modules/translation/translatePharmacyCode.js';

describe('translatePharmacyCode (T025)', () => {
  const pharmacies = [
    { chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', isActive: true },
    { chainInternalCode: 'SUC-02', redVidarPharmacyCode: null, isActive: true }, // registrada pero sin código RV
    { chainInternalCode: 'SUC-03', redVidarPharmacyCode: 'RV1003', isActive: false }, // inactiva
  ];
  const lookup = buildPharmacyLookup(pharmacies);

  it('traduce una farmacia mapeada al código Red Vidar', () => {
    expect(translatePharmacyCode('SUC-01', lookup)).toBe('RV1001');
  });

  it('devuelve null para farmacia sin código Red Vidar (no mapeada)', () => {
    expect(translatePharmacyCode('SUC-02', lookup)).toBeNull();
  });

  it('devuelve null para farmacia inactiva', () => {
    expect(translatePharmacyCode('SUC-03', lookup)).toBeNull();
  });

  it('devuelve null para código inexistente', () => {
    expect(translatePharmacyCode('NO-EXISTE', lookup)).toBeNull();
  });
});
