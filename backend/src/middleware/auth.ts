import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type Role } from '../modules/auth/authService.js';
import { loadConfig } from '../config/index.js';
import { AppError } from './errorHandler.js';

/** Verifica el JWT del portal y adjunta el contexto de autenticación (FR-029). */
export function authJwt(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'NO_AUTENTICADO', 'Falta el token de autenticación.');
  }
  try {
    const payload = verifyToken(header.slice('Bearer '.length), loadConfig().JWT_SECRET);
    req.auth = { kind: 'USER', userId: payload.sub, role: payload.role, chainId: payload.chainId };
    next();
  } catch {
    throw new AppError(401, 'TOKEN_INVALIDO', 'El token de autenticación es inválido o expiró.');
  }
}

/** Restringe el acceso a los roles indicados (FR-029). */
export function requireRole(...roles: Array<Role | 'API_INTEGRATOR'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      throw new AppError(403, 'SIN_PERMISO', 'No tienes permiso para realizar esta acción.');
    }
    next();
  };
}
