import { Router } from 'express';
import { authJwt } from '../../middleware/auth.js';
import { pharmacyActivity } from './activityService.js';
import { isPrivileged } from '../../lib/roles.js';

// Buzón: vista de actividad por farmacia (US6, FR-025).
export const mailboxRouter = Router();

// GET /pharmacies/activity — fecha de última carga exitosa por farmacia. Alcance por rol/cadena (FR-029).
mailboxRouter.get('/pharmacies/activity', authJwt, async (req, res) => {
  const scope = { privileged: isPrivileged(req.auth?.role), chainId: req.auth?.chainId ?? null };
  const chainId = typeof req.query.chainId === 'string' ? req.query.chainId : undefined;
  const activity = await pharmacyActivity(chainId, scope);
  res.json(activity);
});
