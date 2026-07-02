import pino from 'pino';

/**
 * Logger estructurado con REDACCIÓN de datos sensibles para evitar fugas de la credencial de Red Vidar
 * (rv_pc_live_) y de otros secretos en los logs (Principio V, D9, SC-009).
 */
/** Rutas de datos sensibles que el logger redacta (exportadas para verificación en pruebas de seguridad). */
export const redactPaths = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers["x-idempotency-key"]',
  'redVidarApiKey',
  'apiKey',
  'password',
  'passwordHash',
  'keyHash',
  '*.authorization',
  '*.RED_VIDAR_API_KEY',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: redactPaths, censor: '[REDACTADO]' },
});

export type Logger = typeof logger;
