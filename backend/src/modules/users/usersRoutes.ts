import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { authJwt, requireRole } from '../../middleware/auth.js';
import { withUniqueConflict } from '../../lib/prismaErrors.js';
import { hashPassword } from '../auth/authService.js';

// CRUD de usuarios (FR-027). Solo administración. El alta admite SOLO roles con inicio de sesión;
// API_INTEGRATOR NO es un rol de usuario (el integrador solo existe como ApiKey).
export const usersRouter = Router();

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'COORDINATOR', 'PHARMACY_USER']),
  chainId: z.string().nullable().optional(),
});

usersRouter.get('/users', authJwt, requireRole('ADMIN'), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { email: 'asc' },
    select: { id: true, email: true, role: true, chainId: true, isActive: true, createdAt: true },
  });
  res.json(users);
});

usersRouter.post('/users', authJwt, requireRole('ADMIN'), async (req, res) => {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success) {
    // Incluye el rechazo explícito de API_INTEGRATOR (no está en el enum permitido).
    throw new AppError(400, 'DATOS_INVALIDOS', 'Datos de usuario inválidos. El rol debe ser admin, coordinador o usuario-farmacia.');
  }
  if (parsed.data.role === 'PHARMACY_USER' && !parsed.data.chainId) {
    throw new AppError(400, 'CADENA_REQUERIDA', 'El rol usuario-farmacia requiere una cadena asignada.');
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await withUniqueConflict('Ya existe una persona usuaria con ese correo.', () =>
    prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
        chainId: parsed.data.role === 'PHARMACY_USER' ? parsed.data.chainId : (parsed.data.chainId ?? null),
      },
      select: { id: true, email: true, role: true, chainId: true },
    }),
  );
  res.status(201).json(user);
});
