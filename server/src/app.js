import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/errors.js';
import { metaRouter } from './routes/meta.js';
import { scansRouter } from './routes/scans.js';

/** Pure factory: dependencies are injected, so tests can swap storage / AI client. */
export function createApp(deps) {
  const { config, storage } = deps;
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin)), // only the React origin(s)
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '10kb' }));

  app.use('/api', metaRouter(deps));
  app.use('/api/scans', scansRouter(deps));
  if (storage.name === 'local') app.use('/uploads', express.static(storage.root, { index: false, maxAge: '1h' }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
