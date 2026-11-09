import { Router } from 'express';
import mongoose from 'mongoose';
import { User, Checkin, Device } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { toCheckin, toPublicUser } from '../lib/serialize.js';
import { recordCheckin } from '../lib/checkins.js';
import { getKid, getPublicJwk } from '../keys.js';
import { requireStaff } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
router.use(requireStaff);

export const MAX_CHECKINS_PER_SYNC = 200;

const USER_FIELDS = { code: 1, fullName: 1, phone: 1, email: 1, organization: 1, status: 1, createdAt: 1 };

const PHOTO_BUDGET_BYTES = Number(process.env.SNAPSHOT_PHOTO_BUDGET_MB || 4) * 1024 * 1024;

router.get('/snapshot', async (req, res) => {
  const withPhotos = req.query.photos === '1' || req.query.photos === 'true';
  const projection = withPhotos ? { ...USER_FIELDS, photo: 1 } : USER_FIELDS;

  const [users, checkins] = await Promise.all([
    User.find({}, projection).lean(),
    Checkin.find({ duplicate: false }).lean(),
  ]);
  const firstByUser = new Map(checkins.map((c) => [String(c.userId), c]));

  // Keep the response small enough for phones and for serverless limits (Netlify Functions: 6 MB):
  // include photos until the photo budget is used up; the rest show initials on the gate phone.
  if (withPhotos) {
    let budget = PHOTO_BUDGET_BYTES;
    for (const u of users) {
      if (!u.photo) continue;
      if (u.photo.length <= budget) budget -= u.photo.length;
      else u.photo = null;
    }
  }

  res.json({
    serverTime: Date.now(),
    eventName: config.eventName,
    publicKey: { kid: getKid(), jwk: getPublicJwk() },
    users: users.map((u) => toPublicUser(withPhotos ? u : { ...u, photo: null }, firstByUser.get(String(u._id)))),
    checkins: checkins.map(toCheckin),
  });
});

function parseScannedAt(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  return NaN;
}

router.post('/checkins', async (req, res) => {
  const { deviceId, deviceName, checkins } = req.body ?? {};
  if (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > 100) {
    throw new HttpError(400, 'deviceId is required', 'deviceId');
  }
  if (!Array.isArray(checkins)) throw new HttpError(400, 'checkins must be an array', 'checkins');
  if (checkins.length > MAX_CHECKINS_PER_SYNC) {
    throw new HttpError(400, `At most ${MAX_CHECKINS_PER_SYNC} check-ins per request`, 'checkins');
  }
  const devId = deviceId.trim();
  const devName = (typeof deviceName === 'string' && deviceName.trim().slice(0, 60)) || devId;

  const accepted = [];
  const duplicates = [];
  const rejected = [];
  const seen = new Set();
  const candidates = [];

  for (const c of checkins) {
    const id = typeof c?.id === 'string' ? c.id.trim() : '';
    if (!id || id.length > 100) {
      rejected.push({ id: c?.id ?? null, reason: 'invalid id' });
      continue;
    }
    if (seen.has(id)) continue; // repeated within the same batch
    seen.add(id);
    const scannedAt = parseScannedAt(c.scannedAt);
    if (!Number.isFinite(scannedAt) || scannedAt <= 0) {
      rejected.push({ id, reason: 'invalid scannedAt' });
      continue;
    }
    if (!mongoose.isValidObjectId(c.userId)) {
      rejected.push({ id, reason: 'unknown user' });
      continue;
    }
    const verifiedBy = (typeof c.verifiedBy === 'string' && c.verifiedBy.trim().slice(0, 60)) || req.staff.username;
    candidates.push({ id, userId: String(c.userId), scannedAt, verifiedBy });
  }

  const userIds = [...new Set(candidates.map((c) => c.userId))];
  const known = new Set((await User.find({ _id: { $in: userIds } }, { _id: 1 }).lean()).map((u) => String(u._id)));

  // Oldest first, so a batch rarely needs to demote its own entries.
  candidates.sort((a, b) => a.scannedAt - b.scannedAt);

  let inserted = 0;
  for (const c of candidates) {
    if (!known.has(c.userId)) {
      rejected.push({ id: c.id, reason: 'unknown user' });
      continue;
    }
    const r = await recordCheckin({ ...c, deviceId: devId, deviceName: devName });
    accepted.push(c.id);
    if (r.inserted) inserted++;
    if (r.duplicate) duplicates.push({ id: c.id, userId: c.userId, firstCheckin: toCheckin(r.first) });
  }

  await Device.updateOne(
    { _id: devId },
    { $set: { deviceName: devName, lastSyncAt: new Date() }, $inc: { count: inserted } },
    { upsert: true }
  );

  res.json({ accepted, duplicates, rejected, serverTime: Date.now() });
});

export default router;
