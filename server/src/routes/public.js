import { Router } from 'express';
import { User } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { generateCode } from '../lib/code.js';
import { validateRegistration, normalizeEmail, normalizePhone } from '../lib/validate.js';
import { toPublicUser } from '../lib/serialize.js';
import { firstCheckinFor } from '../lib/checkins.js';
import { signPass, getKid, getPublicJwk } from '../keys.js';
import { registerLimiter, lookupLimiter } from '../middleware/rateLimit.js';
import { config } from '../config.js';

const router = Router();

const DUP_MESSAGES = {
  email: 'This email is already registered',
  phone: 'This phone number is already registered',
};

router.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

router.get('/public-key', (_req, res) => {
  res.json({ kid: getKid(), jwk: getPublicJwk(), eventName: config.eventName });
});

router.post('/register', registerLimiter, async (req, res) => {
  const data = validateRegistration(req.body);

  // Friendly pre-check (the unique index below still handles races).
  const clash = await User.findOne({ $or: [...(data.email ? [{ email: data.email }] : []), { phone: data.phone }] }, { email: 1, phone: 1 }).lean();
  if (clash) {
    const field = data.email && clash.email === data.email ? 'email' : 'phone';
    throw new HttpError(409, DUP_MESSAGES[field], field);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const user = await User.create({ ...data, code: generateCode() });
      const qrToken = await signPass(user);
      return res.status(201).json({ user: toPublicUser(user.toObject()), qrToken });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
      if (field === 'code') continue; // code collision — retry with a new code
      if (field === 'email' || field === 'phone') throw new HttpError(409, DUP_MESSAGES[field], field);
      throw err;
    }
  }
  throw new HttpError(503, 'Could not allocate a pass code, please retry');
});

router.post('/pass/lookup', lookupLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const phone = normalizePhone(req.body?.phone);
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim().replace(/\s+/g, ' ') : '';
  if (!email && (fullName.length < 2 || fullName.length > 80)) throw new HttpError(400, 'Full name is required', 'fullName');
  if (!phone) throw new HttpError(400, 'Phone is required', 'phone');

  const user = await User.findOne({ phone, ...(email ? { email } : { fullName: { $regex: `^${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }) }).lean();
  if (!user) throw new HttpError(404, 'No pass found for those details');
  const [first, qrToken] = await Promise.all([firstCheckinFor(user._id), signPass(user)]);
  res.json({ user: toPublicUser(user, first), qrToken });
});

export default router;
