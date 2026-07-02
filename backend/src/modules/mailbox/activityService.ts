import { prisma } from '../../lib/prisma.js';
import type { AuthScope } from './mailboxService.js';

/**
 * Actividad por farmacia (US6, FR-025): fecha de la última carga EXITOSA de cada farmacia, para detectar
 * farmacias que llevan días sin reportar. Una carga exitosa está en CONFIRMED o CONFIRMED_WITH_ERRORS e
 * incluyó al menos un renglón válido de esa farmacia (por su código Red Vidar).
 */
export interface PharmacyActivity {
  pharmacyId: string;
  name: string;
  chainInternalCode: string;
  redVidarPharmacyCode: string | null;
  lastSuccessfulLoadAt: string | null;
}

export async function pharmacyActivity(chainId: string | undefined, scope: AuthScope): Promise<PharmacyActivity[]> {
  const where: { chainId?: string } = {};
  if (!scope.privileged) {
    where.chainId = scope.chainId ?? '__none__';
  } else if (chainId) {
    where.chainId = chainId;
  }

  const pharmacies = await prisma.pharmacy.findMany({
    where,
    orderBy: { chainInternalCode: 'asc' },
    select: { id: true, name: true, chainId: true, chainInternalCode: true, redVidarPharmacyCode: true },
  });

  const result: PharmacyActivity[] = [];
  for (const p of pharmacies) {
    let lastSuccessfulLoadAt: string | null = null;
    if (p.redVidarPharmacyCode) {
      const lastLoad = await prisma.load.findFirst({
        where: {
          chainId: p.chainId,
          status: { in: ['CONFIRMED', 'CONFIRMED_WITH_ERRORS'] },
          rows: { some: { status: 'VALID', redVidarPharmacyCode: p.redVidarPharmacyCode } },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      lastSuccessfulLoadAt = lastLoad ? lastLoad.createdAt.toISOString() : null;
    }
    result.push({
      pharmacyId: p.id,
      name: p.name,
      chainInternalCode: p.chainInternalCode,
      redVidarPharmacyCode: p.redVidarPharmacyCode,
      lastSuccessfulLoadAt,
    });
  }
  return result;
}
