/**
 * Traducción del código de farmacia de la cadena → código Red Vidar (pharmacyCode), FR-003.
 * Función pura: recibe el mapa de equivalencias (construido desde la tabla Pharmacy) y no toca la BD,
 * para poder probarse en aislamiento (Principio II/IX).
 */

/** Mapa de equivalencias de una cadena: chainInternalCode -> redVidarPharmacyCode (solo farmacias mapeadas). */
export type PharmacyLookup = Map<string, string>;

/**
 * Construye el mapa de equivalencias a partir de las farmacias de una cadena.
 * Solo incluye farmacias registradas y con código Red Vidar (mapeadas).
 */
export function buildPharmacyLookup(
  pharmacies: Array<{ chainInternalCode: string; redVidarPharmacyCode: string | null; isActive: boolean }>,
): PharmacyLookup {
  const lookup: PharmacyLookup = new Map();
  for (const p of pharmacies) {
    if (p.isActive && p.redVidarPharmacyCode) {
      lookup.set(p.chainInternalCode, p.redVidarPharmacyCode);
    }
  }
  return lookup;
}

/** Traduce un código de la cadena; devuelve null si la farmacia no está mapeada/registrada. */
export function translatePharmacyCode(chainPharmacyCode: string, lookup: PharmacyLookup): string | null {
  return lookup.get(chainPharmacyCode) ?? null;
}
