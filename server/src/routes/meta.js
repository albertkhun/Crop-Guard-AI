import { Router } from 'express';
import mongoose from 'mongoose';
import { HttpError } from '../utils/httpError.js';

/** /api/health, /api/health/ai (also wakes a sleeping AI Space), /api/classes */
export function metaRouter({ ai, catalog, storage }) {
  const r = Router();
  r.get('/health', (_req, res) =>
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', storage: storage.name }));
  r.get('/health/ai', async (_req, res) => res.json(await ai.health()));
  r.get('/classes', async (_req, res) => {
    const classes = await catalog.get();
    if (!classes) throw new HttpError(503, 'ai_service_unavailable', 'Class list is unavailable while the AI service is waking up.', { retryAfter: 30 });
    res.json({ classes });
  });
  return r;
}
