import { translatePharmacyCode, type PharmacyLookup } from '../translation/translatePharmacyCode.js';

/**
 * Validación local por renglón (FR-004, Principio VIII). Función pura: no consume Red Vidar ni la BD.
 * Reglas: campos requeridos, stock entero >= 0, EAN <= 20, nombre no vacío, farmacia mapeada y registrada.
 * Los renglones que no pasan NO avanzan al encolado (FR-006) y se conservan con su razón (Principio VII).
 */

export const EAN_MAX_LENGTH = 20;
/** Máximo de una columna INTEGER de Postgres (INT4). Un stock por encima desbordaría la BD. */
export const STOCK_MAX = 2_147_483_647;

export interface RawRow {
  rowNumber: number;
  chainPharmacyCode: unknown;
  ean: unknown;
  productName: unknown;
  stock: unknown;
}

export type RowStatus = 'VALID' | 'REJECTED';

export interface ValidatedRow {
  rowNumber: number;
  chainPharmacyCode: string;
  redVidarPharmacyCode: string | null;
  ean: string;
  productName: string;
  stock: number;
  status: RowStatus;
  rejectionReason: string | null;
  /** true cuando el rechazo se debe a farmacia no mapeada (se agrupa aparte, no en rowErrors). */
  unmapped: boolean;
}

export interface ValidationResult {
  rows: ValidatedRow[];
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  unmappedPharmacyCount: number;
  rowErrors: Array<{ rowNumber: number; reason: string }>;
  unmappedPharmacies: Array<{ chainPharmacyCode: string; rowCount: number }>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Valida las reglas de campo de un renglón. Devuelve las razones de rechazo (vacío = válido). */
function checkFieldRules(chainPharmacyCode: string, ean: string, productName: string, rawStock: unknown): string[] {
  const reasons: string[] = [];

  const missing: string[] = [];
  if (!chainPharmacyCode) missing.push('código de farmacia');
  if (!ean) missing.push('EAN');
  if (!productName) missing.push('nombre del producto');
  if (asString(rawStock) === '') missing.push('stock');
  if (missing.length > 0) {
    reasons.push(`faltan campos requeridos: ${missing.join(', ')}`);
  }

  if (ean && ean.length > EAN_MAX_LENGTH) {
    reasons.push(`el EAN excede ${EAN_MAX_LENGTH} caracteres`);
  }

  if (asString(rawStock) !== '') {
    const stockNum = Number(rawStock);
    if (!Number.isInteger(stockNum) || stockNum < 0) {
      reasons.push('el stock debe ser un entero mayor o igual a 0');
    } else if (stockNum > STOCK_MAX) {
      reasons.push(`el stock excede el máximo permitido (${STOCK_MAX})`);
    }
  }

  // productName vacío ya se cubre en "faltan campos requeridos"; sin regla adicional.
  return reasons;
}

export function validateRows(rawRows: RawRow[], lookup: PharmacyLookup): ValidationResult {
  const rows: ValidatedRow[] = [];
  const rowErrors: Array<{ rowNumber: number; reason: string }> = [];
  const unmappedCounter = new Map<string, number>();
  let validRows = 0;
  let rejectedRows = 0;
  let unmappedPharmacyCount = 0;

  for (const raw of rawRows) {
    const chainPharmacyCode = asString(raw.chainPharmacyCode);
    const ean = asString(raw.ean);
    const productName = asString(raw.productName);
    const stockNum = Number(asString(raw.stock));

    const fieldReasons = checkFieldRules(chainPharmacyCode, ean, productName, raw.stock);

    if (fieldReasons.length > 0) {
      const reason = fieldReasons.join('; ');
      rejectedRows += 1;
      rowErrors.push({ rowNumber: raw.rowNumber, reason });
      rows.push({
        rowNumber: raw.rowNumber,
        chainPharmacyCode,
        redVidarPharmacyCode: null,
        ean,
        productName,
        stock: Number.isFinite(stockNum) ? stockNum : 0,
        status: 'REJECTED',
        rejectionReason: reason,
        unmapped: false,
      });
      continue;
    }

    // Campos válidos: intentar traducir la farmacia.
    const redVidarPharmacyCode = translatePharmacyCode(chainPharmacyCode, lookup);
    if (!redVidarPharmacyCode) {
      unmappedPharmacyCount += 1;
      unmappedCounter.set(chainPharmacyCode, (unmappedCounter.get(chainPharmacyCode) ?? 0) + 1);
      rows.push({
        rowNumber: raw.rowNumber,
        chainPharmacyCode,
        redVidarPharmacyCode: null,
        ean,
        productName,
        stock: stockNum,
        status: 'REJECTED',
        rejectionReason: 'farmacia no mapeada o no registrada',
        unmapped: true,
      });
      continue;
    }

    validRows += 1;
    rows.push({
      rowNumber: raw.rowNumber,
      chainPharmacyCode,
      redVidarPharmacyCode,
      ean,
      productName,
      stock: stockNum,
      status: 'VALID',
      rejectionReason: null,
      unmapped: false,
    });
  }

  const unmappedPharmacies = Array.from(unmappedCounter.entries()).map(([chainPharmacyCode, rowCount]) => ({
    chainPharmacyCode,
    rowCount,
  }));

  return {
    rows,
    totalRows: rawRows.length,
    validRows,
    rejectedRows,
    unmappedPharmacyCount,
    rowErrors,
    unmappedPharmacies,
  };
}
