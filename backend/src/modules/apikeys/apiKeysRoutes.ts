import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authJwt, requireRole } from '../../middleware/auth.js';
import { generateApiKey, revokeApiKey } from './apiKeysService.js';

// Generación/revocación de claves de API (FR-028). Solo administración.
export const apiKeysRouter = Router();

// Listado (sin el secreto: solo metadatos y last4).
apiKeysRouter.get('/chains/:chainId/api-keys', authJwt, requireRole('ADMIN'), async (req, res) => {
  const keys = await prisma.apiKey.findMany({
    where: { chainId: req.params.chainId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, prefix: true, last4: true, status: true, createdAt: true, revokedAt: true },
  });
  res.json(keys);
});

// Generar (revoca automáticamente la ACTIVE previa; muestra el secreto una sola vez).
apiKeysRouter.post('/chains/:chainId/api-keys', authJwt, requireRole('ADMIN'), async (req, res) => {
  const result = await generateApiKey(req.params.chainId, req.auth?.userId ?? null);
  res.status(201).json(result);
});

// Revocar.
apiKeysRouter.post('/api-keys/:apiKeyId/revoke', authJwt, requireRole('ADMIN'), async (req, res) => {
  await revokeApiKey(req.params.apiKeyId, req.auth?.userId ?? null);
  res.status(204).send();
});
