import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { config } from './config.js';
import publicRoutes from './routes/public.js';
import staffRoutes from './routes/staff.js';
import syncRoutes from './routes/sync.js';
import adminRoutes from './routes/admin.js';
import { notFound, errorHandler } from './middleware/errors.js';

/** @param {{ compress?: boolean }} opts — compression is off on Netlify Functions (the CDN compresses). */
export function createApp({ compress = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.length ? config.corsOrigin : true }));
  if (compress) app.use(compression());
  app.use(morgan(config.isProduction ? 'combined' : 'dev', { skip: (req) => req.originalUrl === '/api/health' }));
  // Bulk Excel uploads arrive as JSON chunks of up to 1,000 rows.
  app.use('/api/admin/users/bulk', express.json({ limit: '5mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', publicRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
