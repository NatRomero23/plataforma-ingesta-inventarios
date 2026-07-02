import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { loadConfig } from '../../config/index.js';
import { AppError } from '../../middleware/errorHandler.js';
import { signToken, verifyPassword, type Role } from './authService.js';

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'DATOS_INVALIDOS', 'Correo o contraseña con formato inválido.');
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.isActive || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');
  }
  const token = signToken(
    { sub: user.id, role: user.role as Role, chainId: user.chainId },
    loadConfig().JWT_SECRET,
  );
  res.json({ token, role: user.role, chainId: user.chainId });
});
