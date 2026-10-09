import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { createUploadMiddleware } from '../middleware/upload.js';
import { createScansController } from '../controllers/scans.controller.js';
import { HttpError } from '../utils/httpError.js';

export function scansRouter(deps) {
  const { config } = deps;
  const c = createScansController(deps);
  const upload = createUploadMiddleware(config.upload.maxBytes);
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'rate_limited', 'Too many scans from this network. Please wait a few minutes.')),
  });

  const r = Router();
  r.use(authenticate); // JWT slot: all scan routes already pass through here
  r.post('/', limiter, upload, c.create);
  r.get('/', c.list);
  r.get('/:id', c.get);
  r.post('/:id/feedback', c.feedback);
  return r;
}
