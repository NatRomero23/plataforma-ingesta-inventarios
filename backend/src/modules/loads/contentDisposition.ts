/**
 * Sanea un nombre de archivo para usarlo en la cabecera Content-Disposition (auditoría #2).
 * El nombre original proviene de la subida (no confiable): se eliminan caracteres de control,
 * comillas y backslashes que permitirían romper la cabecera o inyectar otras (response splitting).
 */
export function safeContentDispositionFilename(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback;
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '') // caracteres de control (incluye CR/LF)
    .replace(/["\\]/g, '') // comillas y backslashes rompen filename="..."
    .trim();
  return cleaned === '' ? fallback : cleaned;
}
