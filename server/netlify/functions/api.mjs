// Netlify Function: runs the Express API (server/src) serverlessly at /api/*.
// netlify.toml rewrites /api/* → /.netlify/functions/api/:splat; Express routes live under /api.
import serverless from 'serverless-http';
import { createApp } from '../../src/app.js';
import { bootstrap } from '../../src/bootstrap.js';

const app = createApp({ compress: false });
const run = serverless(app);
const FN_PREFIX = '/.netlify/functions/api';

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false; // keep the MongoDB connection open between invocations
  await bootstrap();

  // Depending on how the request arrived, the path is /api/... or /.netlify/functions/api/... — normalise to /api/...
  let path = event.path || event.rawPath || '/';
  if (path.startsWith(FN_PREFIX)) path = '/api' + (path.slice(FN_PREFIX.length) || '/');
  if (!path.startsWith('/api')) path = '/api' + (path.startsWith('/') ? path : `/${path}`);

  return run({ ...event, path, rawPath: path }, context);
};
