import ExcelJS from 'exceljs';
import { AppError } from '../../middleware/errorHandler.js';
import type { RawRow } from '../validation/validateRows.js';
import { TEMPLATE_COLUMNS, normalizeHeader } from './excelTemplate.js';

/**
 * Parseo del Excel subido contra la plantilla fija (FR-002). Si faltan columnas requeridas, rechaza el
 * archivo completo con un mensaje en es-MX. No hay tope de renglones (FR-002a); el límite es por tamaño de
 * archivo, aplicado en el middleware de subida.
 */
export async function parseInventoryExcel(buffer: Buffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError(400, 'ARCHIVO_INVALIDO', 'No se pudo leer el archivo. Debe ser un Excel (.xlsx) válido.');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new AppError(400, 'ARCHIVO_VACIO', 'El archivo no contiene hojas de cálculo.');
  }

  const headerRow = sheet.getRow(1);
  const headerIndex = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    headerIndex.set(normalizeHeader(String(cell.value ?? '')), colNumber);
  });

  const columnMap: Record<string, number> = {};
  const missing: string[] = [];
  for (const col of TEMPLATE_COLUMNS) {
    const idx = headerIndex.get(normalizeHeader(col));
    if (idx === undefined) missing.push(col);
    else columnMap[col] = idx;
  }
  if (missing.length > 0) {
    throw new AppError(
      400,
      'COLUMNAS_FALTANTES',
      `El archivo no corresponde a la plantilla. Faltan columnas: ${missing.join(', ')}.`,
    );
  }

  const rows: RawRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const chainPharmacyCode = cellText(row.getCell(columnMap['Código de farmacia']).value);
    const ean = cellText(row.getCell(columnMap['EAN']).value);
    const productName = cellText(row.getCell(columnMap['Nombre del producto']).value);
    const stock = row.getCell(columnMap['Stock']).value;

    // Omitir filas completamente vacías.
    if (!chainPharmacyCode && !ean && !productName && (stock === null || stock === undefined || stock === '')) {
      continue;
    }
    rows.push({ rowNumber, chainPharmacyCode, ean, productName, stock: cellText(stock) });
  }
  return rows;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) return String((value as { text: unknown }).text ?? '').trim();
  if (typeof value === 'object' && 'result' in value) return String((value as { result: unknown }).result ?? '').trim();
  return String(value).trim();
}
