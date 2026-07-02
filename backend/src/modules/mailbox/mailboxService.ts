import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/**
 * Buzón de cargas (US3, FR-023). Listado con filtros y paginación, con alcance por rol (FR-029):
 * admin/coordinador ven todas las cadenas; usuario-farmacia queda restringido a su propia cadena.
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
}

const PAGE_SIZE = 50;

export function buildLoadWhere(filters: LoadFilters, scope: AuthScope): Prisma.LoadWhereInput {
  const where: Prisma.LoadWhereInput = {};

  // Alcance por rol: no privilegiado => solo su cadena (FR-029).
  if (!scope.privileged) {
    where.chainId = scope.chainId ?? '__none__';
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
