import ExcelJS from 'exceljs';

/** Columnas fijas de la plantilla de inventario definida por la plataforma (FR-001). */
export const TEMPLATE_COLUMNS = [
  'Código de farmacia',
  'EAN',
  'Nombre del producto',
  'Stock',
] as const;

/** Normaliza un encabezado para comparación tolerante (minúsculas, sin acentos ni espacios extra). */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Genera el archivo Excel de plantilla (encabezados fijos). */
export async function buildTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventario');
  sheet.addRow([...TEMPLATE_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
