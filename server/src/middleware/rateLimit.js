import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

// Behind the Netlify proxy every request arrives from Netlify's servers, so limit per real visitor:
// Netlify passes the browser's IP in x-nf-client-connection-ip.
const clientKey = (req) => {
  const nf = req.headers['x-nf-client-connection-ip'];
  return ipKeyGenerator(typeof nf === 'string' && nf ? nf.trim() : req.ip || '');
};

const make = (limit, windowMs, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: clientKey,
    handler: (_req, res) => res.status(429).json({ error: message }),
  });

const FIFTEEN_MIN = 15 * 60 * 1000;
export const registerLimiter = make(30, FIFTEEN_MIN, 'Too many registrations from this network, please try again later');
export const lookupLimiter = make(30, FIFTEEN_MIN, 'Too many lookups, please try again later');
export const loginLimiter = make(20, FIFTEEN_MIN, 'Too many login attempts, please try again later');
