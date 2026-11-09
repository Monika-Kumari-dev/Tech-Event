import mongoose from 'mongoose';
import { HttpError } from '../lib/errors.js';

export function notFound(req, _res, next) {
  next(new HttpError(404, `Not found: ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json(err.field ? { error: err.message, field: err.field } : { error: err.message });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large (max 1mb)' });
  if (err instanceof mongoose.Error.ValidationError) {
    const field = Object.keys(err.errors)[0];
    return res.status(400).json({ error: err.errors[field]?.message || 'Validation failed', field });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: `Invalid ${err.path}`, field: err.path });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || err.keyPattern || {})[0];
    return res.status(409).json(field ? { error: `${field} already exists`, field } : { error: 'Already exists' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
}
