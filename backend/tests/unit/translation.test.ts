import { describe, it, expect } from 'vitest';
import {
  buildPharmacyLookup,
  normalizePharmacyCode,
  translatePharmacyCode,
} from '../../src/modules/translation/translatePharmacyCode.js';

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

describe('normalizePharmacyCode', () => {
  it('quita ceros a la izquierda', () => {
    expect(normalizePharmacyCode('007')).toBe('7');
    expect(normalizePharmacyCode('012')).toBe('12');
  });

  it('conserva un "0" para códigos de puros ceros', () => {
    expect(normalizePharmacyCode('000')).toBe('0');
    expect(normalizePharmacyCode('0')).toBe('0');
  });

  it('recorta espacios antes de normalizar', () => {
    expect(normalizePharmacyCode('  012 ')).toBe('12');
  });

  it('no altera códigos sin ceros a la izquierda', () => {
    expect(normalizePharmacyCode('SUC-01')).toBe('SUC-01');
    expect(normalizePharmacyCode('7')).toBe('7');
  });
});

describe('translatePharmacyCode — tolerancia a ceros a la izquierda (auditoría #1)', () => {
  it('traduce cuando Excel pierde los ceros: registrado "007", llega "7"', () => {
    const lookup = buildPharmacyLookup([
      { chainInternalCode: '007', redVidarPharmacyCode: 'RV7', isActive: true },
    ]);
    expect(translatePharmacyCode('7', lookup)).toBe('RV7');
  });

  it('traduce en el sentido inverso: registrado "7", llega "007"', () => {
    const lookup = buildPharmacyLookup([
      { chainInternalCode: '7', redVidarPharmacyCode: 'RV7', isActive: true },
    ]);
    expect(translatePharmacyCode('007', lookup)).toBe('RV7');
  });

  it('la coincidencia exacta tiene prioridad sobre la normalizada', () => {
    const lookup = buildPharmacyLookup([
      { chainInternalCode: '007', redVidarPharmacyCode: 'RV007', isActive: true },
      { chainInternalCode: '7', redVidarPharmacyCode: 'RV7', isActive: true },
    ]);
    expect(translatePharmacyCode('007', lookup)).toBe('RV007');
    expect(translatePharmacyCode('7', lookup)).toBe('RV7');
  });

  it('no adivina cuando el código normalizado es ambiguo', () => {
    // "007" y "7" coexisten con códigos RV distintos: "07" no coincide exacto con ninguno
    // y su forma normalizada ("7") es ambigua => no se traduce (se reporta como no mapeada).
    const lookup = buildPharmacyLookup([
      { chainInternalCode: '007', redVidarPharmacyCode: 'RV007', isActive: true },
      { chainInternalCode: '7', redVidarPharmacyCode: 'RV7', isActive: true },
    ]);
    expect(translatePharmacyCode('07', lookup)).toBeNull();
  });

  it('el respaldo normalizado respeta farmacias inactivas o sin código RV', () => {
    const lookup = buildPharmacyLookup([
      { chainInternalCode: '003', redVidarPharmacyCode: null, isActive: true },
      { chainInternalCode: '004', redVidarPharmacyCode: 'RV4', isActive: false },
    ]);
    expect(translatePharmacyCode('3', lookup)).toBeNull();
    expect(translatePharmacyCode('4', lookup)).toBeNull();
  });
});
