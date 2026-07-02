import { Router } from 'express';
import { AppError } from '../../middleware/errorHandler.js';
import { authJwt, requireRole } from '../../middleware/auth.js';
import { authUserOrApiKey } from '../../middleware/authApiKey.js';
import { confirmLoad, getLoadSummary, getLoadOriginal } from './loadsService.js';
import { toLoadDetail } from './loadPresenter.js';
import { listLoads } from '../mailbox/mailboxService.js';
import { isPrivileged } from '../../lib/roles.js';

export const loadsRouter = Router();

// POST /loads/:loadId/confirm — confirma y encola los válidos (FR-006/007)
loadsRouter.post('/loads/:loadId/confirm', authJwt, requireRole('PHARMACY_USER', 'ADMIN'), async (req, res) => {
  await confirmLoad(req.params.loadId, req.auth?.chainId ?? null, isPrivileged(req.auth?.role));
  res.status(202).json({ code: 'ENCOLADA', message: 'La carga se encoló para envío a Red Vidar.' });
});

// GET /loads/:loadId — estado y detalle de una carga (FR-011/FR-024). Autenticación por JWT o clave de API;
// alcance por rol/cadena: integrador y usuario-farmacia solo ven cargas de su cadena (FR-029).
loadsRouter.get('/loads/:loadId', authUserOrApiKey, async (req, res) => {
  const load = await getLoadSummary(req.params.loadId);
  if (!isPrivileged(req.auth?.role) && load.chainId !== req.auth?.chainId) {
    throw new AppError(403, 'SIN_PERMISO', 'No tienes permiso sobre esta carga.');
  }
  res.json(toLoadDetail(load));
});

// GET /loads/:loadId/original — descarga del archivo/payload original (FR-024). Alcance por rol/cadena.
loadsRouter.get('/loads/:loadId/original', authJwt, async (req, res) => {
  const original = await getLoadOriginal(req.params.loadId);
  if (!isPrivileged(req.auth?.role) && original.chainId !== req.auth?.chainId) {
    throw new AppError(403, 'SIN_PERMISO', 'No tienes permiso sobre esta carga.');
  }
  res.setHeader('Content-Type', original.contentType);
  const filename = original.originalFilename ?? `carga-${req.params.loadId}`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(original.originalBlob);
});

// GET /loads — buzón con filtros (FR-023). Usuario-farmacia: solo su cadena; admin/coordinador: todas.
loadsRouter.get('/loads', authJwt, async (req, res) => {
  const scope = { privileged: isPrivileged(req.auth?.role), chainId: req.auth?.chainId ?? null };
  const q = req.query;
  const loads = await listLoads(
    {
      chainId: typeof q.chainId === 'string' ? q.chainId : undefined,
      pharmacyCode: typeof q.pharmacyCode === 'string' ? q.pharmacyCode : undefined,
      status: typeof q.status === 'string' ? q.status : undefined,
      dateFrom: typeof q.dateFrom === 'string' ? q.dateFrom : undefined,
      dateTo: typeof q.dateTo === 'string' ? q.dateTo : undefined,
      page: typeof q.page === 'string' ? Number(q.page) : undefined,
    },
    scope,
  );
  res.json(loads);
});
