import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/**
 * Buzón de cargas (US3, FR-023). Listado con filtros y paginación, con alcance por rol (FR-029):
 * admin/coordinador ven todas las cadenas; el usuario-farmacia SOLO ve las cargas que él mismo subió
 * por el portal (uploaderUserId = su usuario). Las cargas de origen API no tienen uploaderUserId, así
 * que quedan fuera de su vista "Mis cargas" y solo son visibles para admin/coordinador en el Buzón
 * (decisión de alcance, ver spec.md FR-029 y Clarifications 2026-07-08).
 */

export interface LoadFilters {
  chainId?: string;
  pharmacyCode?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}

export interface AuthScope {
  privileged: boolean; // ADMIN o COORDINATOR
  chainId: string | null;
  /** Id del usuario autenticado; acota el alcance del usuario-farmacia a sus propias cargas. */
  userId?: string | null;
}

const PAGE_SIZE = 50;

export function buildLoadWhere(filters: LoadFilters, scope: AuthScope): Prisma.LoadWhereInput {
  const where: Prisma.LoadWhereInput = {};

  // Alcance por rol (FR-029): el usuario-farmacia solo ve SUS cargas del portal (las que subió).
  // Esto excluye las cargas de origen API de su cadena, que solo ven admin/coordinador en el Buzón.
  if (!scope.privileged) {
    where.uploaderUserId = scope.userId ?? '__none__';
  } else if (filters.chainId) {
    where.chainId = filters.chainId;
  }

  if (filters.status) {
    where.status = filters.status as Prisma.LoadWhereInput['status'];
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      // Incluir todo el día final (hasta 23:59:59.999).
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      (where.createdAt as Prisma.DateTimeFilter).lte = to;
    }
  }

  if (filters.pharmacyCode) {
    where.rows = {
      some: {
        OR: [{ redVidarPharmacyCode: filters.pharmacyCode }, { chainPharmacyCode: filters.pharmacyCode }],
      },
    };
  }

  return where;
}

export async function listLoads(filters: LoadFilters, scope: AuthScope) {
  const where = buildLoadWhere(filters, scope);
  const page = Math.max(1, filters.page ?? 1);
  const loads = await prisma.load.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      chainId: true,
      origin: true,
      status: true,
      totalRows: true,
      validRows: true,
      rejectedRows: true,
      createdAt: true,
    },
  });
  return loads.map((l) => ({ ...l, loadId: l.id }));
}
