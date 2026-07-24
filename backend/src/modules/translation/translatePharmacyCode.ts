/**
 * Traducción del código de farmacia de la cadena → código Red Vidar (pharmacyCode), FR-003.
 * Función pura: recibe el mapa de equivalencias (construido desde la tabla Pharmacy) y no toca la BD,
 * para poder probarse en aislamiento (Principio II/IX).
 */

/**
 * Mapa de equivalencias de una cadena (solo farmacias mapeadas), con respaldo tolerante a
 * ceros a la izquierda (FR-003). Excel entrega las celdas numéricas como número, así que un código
 * registrado como "007" puede llegar como "7"; el respaldo por código normalizado lo reconcilia.
 */
export interface PharmacyLookup {
  /** Coincidencia exacta: chainInternalCode tal cual está registrado -> redVidarPharmacyCode. */
  byExact: Map<string, string>;
  /**
   * Respaldo por código normalizado -> redVidarPharmacyCode, o null si es AMBIGUO
   * (dos códigos internos distintos colapsan al mismo, p. ej. "7" y "007"): en ese caso no se traduce.
   */
  byNormalized: Map<string, string | null>;
}

/** Normaliza para comparación tolerante: quita espacios y ceros a la izquierda ("007" -> "7", "000" -> "0"). */
export function normalizePharmacyCode(code: string): string {
  const stripped = code.trim().replace(/^0+/, '');
  return stripped === '' ? '0' : stripped;
}

/**
 * Construye el mapa de equivalencias a partir de las farmacias de una cadena.
 * Solo incluye farmacias registradas y con código Red Vidar (mapeadas).
 */
export function buildPharmacyLookup(
  pharmacies: Array<{ chainInternalCode: string; redVidarPharmacyCode: string | null; isActive: boolean }>,
): PharmacyLookup {
  const byExact = new Map<string, string>();
  const byNormalized = new Map<string, string | null>();
  for (const p of pharmacies) {
    if (!p.isActive || !p.redVidarPharmacyCode) continue;
    byExact.set(p.chainInternalCode, p.redVidarPharmacyCode);
    const norm = normalizePharmacyCode(p.chainInternalCode);
    // Colisión de normalización -> ambiguo: no se puede traducir sin riesgo de mapear a la farmacia equivocada.
    byNormalized.set(norm, byNormalized.has(norm) ? null : p.redVidarPharmacyCode);
  }
  return { byExact, byNormalized };
}

/** Traduce un código de la cadena; devuelve null si la farmacia no está mapeada/registrada. */
export function translatePharmacyCode(chainPharmacyCode: string, lookup: PharmacyLookup): string | null {
  const exact = lookup.byExact.get(chainPharmacyCode);
  if (exact) return exact;
  // Respaldo: tolerar ceros a la izquierda perdidos por Excel. null explícito = ambiguo => no traducir.
  return lookup.byNormalized.get(normalizePharmacyCode(chainPharmacyCode)) ?? null;
}
