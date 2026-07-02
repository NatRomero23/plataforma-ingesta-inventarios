import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { authJwt, requireRole } from '../../middleware/auth.js';

// CRUD de farmacias / tabla de equivalencias (FR-026). Solo administración.
export const pharmaciesRouter = Router();

const pharmacySchema = z.object({
  chainInternalCode: z.string().min(1),
  redVidarPharmacyCode: z.string().min(1).nullable().optional(),
  name: z.string().min(1),
});

pharmaciesRouter.get(
  '/chains/:chainId/pharmacies',
  authJwt,
  requireRole('ADMIN', 'COORDINATOR'),
  async (req, res) => {
    const pharmacies = await prisma.pharmacy.findMany({
      where: { chainId: req.params.chainId },
      orderBy: { chainInternalCode: 'asc' },
    });
    res.json(pharmacies);
  },
);

pharmaciesRouter.post('/chains/:chainId/pharmacies', authJwt, requireRole('ADMIN'), async (req, res) => {
  const parsed = pharmacySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'DATOS_INVALIDOS', 'Datos de farmacia inválidos.');
  const chain = await prisma.chain.findUnique({ where: { id: req.params.chainId } });
  if (!chain) throw new AppError(404, 'CADENA_NO_ENCONTRADA', 'No se encontró la cadena.');

  try {
    const pharmacy = await prisma.pharmacy.create({
      data: {
        chainId: req.params.chainId,
        chainInternalCode: parsed.data.chainInternalCode,
        redVidarPharmacyCode: parsed.data.redVidarPharmacyCode ?? null,
        name: parsed.data.name,
      },
    });
    res.status(201).json(pharmacy);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Distinguir cuál restricción de unicidad se violó para dar un mensaje correcto.
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(',') : String(err.meta?.target ?? '');
      if (target.includes('redVidarPharmacyCode')) {
        throw new AppError(
          409,
          'CODIGO_REDVIDAR_DUPLICADO',
          'El código Red Vidar ya está asignado a otra farmacia (debe ser único en toda la plataforma).',
        );
      }
      throw new AppError(409, 'CODIGO_INTERNO_DUPLICADO', 'Ya existe una farmacia con ese código interno en la cadena.');
    }
    throw err;
  }
});
