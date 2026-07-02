import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { authJwt, requireRole } from '../../middleware/auth.js';
import { withUniqueConflict } from '../../lib/prismaErrors.js';

// CRUD de cadenas (FR-026). Solo administración.
export const chainsRouter = Router();

const chainSchema = z.object({ name: z.string().min(1) });

chainsRouter.get('/chains', authJwt, requireRole('ADMIN', 'COORDINATOR'), async (_req, res) => {
  const chains = await prisma.chain.findMany({ orderBy: { name: 'asc' } });
  res.json(chains);
});

chainsRouter.post('/chains', authJwt, requireRole('ADMIN'), async (req, res) => {
  const parsed = chainSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'DATOS_INVALIDOS', 'El nombre de la cadena es requerido.');
  const chain = await withUniqueConflict('Ya existe una cadena con ese nombre.', () =>
    prisma.chain.create({ data: { name: parsed.data.name } }),
  );
  res.status(201).json(chain);
});
