import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

/** Error de aplicación con código estable y mensaje en es-MX (FR: forma {code, message}). */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  logger.error({ err, path: req.path }, 'Error no controlado');
  res.status(500).json({ code: 'ERROR_INTERNO', message: 'Ocurrió un error interno. Intenta de nuevo más tarde.' });
}
