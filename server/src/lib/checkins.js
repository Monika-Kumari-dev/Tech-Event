import { Checkin } from '../models/index.js';

/** Map of userId(string) -> first (non-duplicate) check-in (lean). */
export async function firstCheckinMap(userIds) {
  const filter = { duplicate: false };
  if (userIds) filter.userId = { $in: userIds };
  const rows = await Checkin.find(filter).lean();
  return new Map(rows.map((c) => [String(c.userId), c]));
}

export const firstCheckinFor = (userId) => Checkin.findOne({ userId, duplicate: false }).lean();

/**
 * Store one check-in, keeping exactly one non-duplicate (earliest scannedAt) per user.
 * Returns { inserted, duplicate, first } where `first` is the winning check-in when duplicate.
 */
export async function recordCheckin({ id, userId, scannedAt, deviceId, deviceName, verifiedBy }) {
  const scanned = new Date(scannedAt);
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await Checkin.findById(id).lean();
    if (existing) {
      if (!existing.duplicate) return { inserted: false, duplicate: false, first: null };
      return { inserted: false, duplicate: true, first: await firstCheckinFor(existing.userId) };
    }

    const first = await firstCheckinFor(userId);
    const doc = { _id: id, userId, deviceId, deviceName, verifiedBy, scannedAt: scanned, syncedAt: new Date() };
    try {
      if (first && first.scannedAt.getTime() <= scanned.getTime()) {
        await Checkin.create({ ...doc, duplicate: true });
        return { inserted: true, duplicate: true, first };
      }
      if (first) {
        // New one is earlier: demote the old first check-in.
        const r = await Checkin.updateOne({ _id: first._id, duplicate: false }, { $set: { duplicate: true } });
        if (r.modifiedCount === 0) continue; // changed concurrently — re-evaluate
      }
      await Checkin.create({ ...doc, duplicate: false });
      return { inserted: true, duplicate: false, first: null };
    } catch (err) {
      if (err?.code === 11000) continue; // same id inserted concurrently, or another "first" won the race
      throw err;
    }
  }
  throw new Error(`Could not record check-in ${id} after retries`);
}
