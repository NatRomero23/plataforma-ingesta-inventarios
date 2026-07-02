import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';
import { authJwt } from './auth.js';

/**
 * Autenticación por clave de API de integrador (FR-012, FR-029).
 * La clave se recibe en el encabezado X-API-Key; se verifica contra el hash bcrypt de las claves ACTIVE.
 * Una clave inexistente o revocada NO autentica. Establece el scope API_INTEGRATOR.
 */
export async function authApiKey(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const provided = req.header('x-api-key');
  if (!provided) {
    throw new AppError(401, 'NO_AUTENTICADO', 'Falta la clave de API.');
  }
  const last4 = provided.slice(-4);
  const candidates = await prisma.apiKey.findMany({ where: { status: 'ACTIVE', last4 } });
  for (const key of candidates) {
    if (await bcrypt.compare(provided, key.keyHash)) {
      req.auth = { kind: 'API_KEY', role: 'API_INTEGRATOR', chainId: key.chainId, apiKeyId: key.id };
      next();
      return;
    }
  }
  throw new AppError(401, 'CLAVE_INVALIDA', 'La clave de API es inválida o fue revocada.');
}

/**
 * Autenticación dual: si viene X-API-Key, autentica como integrador; si no, exige JWT del portal.
 * Usada por endpoints accesibles tanto por integradores como por usuarios/coordinación (p. ej. detalle de carga).
 */
export function authUserOrApiKey(req: Request, res: Response, next: NextFunction): void | Promise<void> {
  if (req.header('x-api-key')) {
    return authApiKey(req, res, next);
  }
  return authJwt(req, res, next);
}
