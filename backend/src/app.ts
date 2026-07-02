import 'express-async-errors';
import express from 'express';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/authRoutes.js';
import { uploadRouter } from './modules/uploads/uploadRoutes.js';
import { integrationRouter } from './modules/uploads/integrationRoutes.js';
import { loadsRouter } from './modules/loads/loadsRoutes.js';
import { mailboxRouter } from './modules/mailbox/mailboxRoutes.js';
import { chainsRouter } from './modules/chains/chainsRoutes.js';
import { pharmaciesRouter } from './modules/pharmacies/pharmaciesRoutes.js';
import { usersRouter } from './modules/users/usersRoutes.js';
import { apiKeysRouter } from './modules/apikeys/apiKeysRoutes.js';

/**
 * Ensamblado de la app Express. El límite de tamaño de subida se aplica en el router de uploads (multer),
 * conforme a MAX_UPLOAD_BYTES (FR-002a). Errores centralizados con mensajes en es-MX.
 */
export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' })); // cuerpos JSON (login, etc.); las subidas van por multipart
  app.use(requestLogger);

  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', uploadRouter);
  app.use('/api/v1', integrationRouter);
  app.use('/api/v1', loadsRouter);
  app.use('/api/v1', mailboxRouter);
  app.use('/api/v1', chainsRouter);
  app.use('/api/v1', pharmaciesRouter);
  app.use('/api/v1', usersRouter);
  app.use('/api/v1', apiKeysRouter);

  // Middleware de errores al final (captura AppError y no controlados).
  app.use(errorHandler);
  return app;
}
