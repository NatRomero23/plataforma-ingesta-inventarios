import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Autenticación (Principio V): contraseñas con bcrypt; JWT con claims role y chainId.
 * Nota de implementación: se usa `bcryptjs` (implementación pura JS del algoritmo bcrypt) para portabilidad
 * multiplataforma sin compilación nativa; el algoritmo de hash es bcrypt, conforme a la constitución.
 */

export type Role = 'ADMIN' | 'COORDINATOR' | 'PHARMACY_USER';

export interface JwtPayload {
  sub: string; // userId
  role: Role;
  chainId: string | null;
}

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(
  payload: JwtPayload,
  secret: string,
  expiresIn: jwt.SignOptions['expiresIn'] = '8h',
): string {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyToken(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}
