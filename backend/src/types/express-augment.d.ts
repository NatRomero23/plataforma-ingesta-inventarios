import type { Role } from '../modules/auth/authService.js';

/** Contexto de autenticación adjunto a la petición. */
export interface AuthContext {
  kind: 'USER' | 'API_KEY';
  userId?: string;
  /** Scope de autorización: los tres roles de usuario, o API_INTEGRATOR para acceso por clave de API. */
  role: Role | 'API_INTEGRATOR';
  chainId: string | null;
  apiKeyId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
