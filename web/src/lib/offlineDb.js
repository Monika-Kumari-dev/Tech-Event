// Local (IndexedDB) store for the offline verifier. See CONTRACT.md for shapes.
//
// users:    snapshot of every registered attendee (replaced on each snapshot import)
// checkins: check-ins recorded on this device (source 'local', status pending|synced|duplicate)
//           + first check-ins learned from the server snapshot (source 'remote', status 'synced')
// meta:     key/value — publicKey, eventName, lastSnapshotAt, lastSyncAt, deviceId, deviceName
import Dexie from 'dexie';

export const db = new Dexie('qrpass');

db.version(1).stores({
  users: '&id, code',
  checkins: '&id, userId, status, scannedAt, source',
  meta: '&key',
});

// ---------- meta helpers ----------
export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return db.meta.put({ key, value });
}

export async function getAllMeta() {
  const rows = await db.meta.toArray();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

let deviceIdPromise;
/** Stable per-install device id (created once). */
export function getDeviceId() {
  if (!deviceIdPromise) {
    deviceIdPromise = db.transaction('rw', db.meta, async () => {
      let id = await getMeta('deviceId');
      if (!id) {
        id = uuid();
        await setMeta('deviceId', id);
      }
      return id;
    });
  }
  return deviceIdPromise;
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Fallback for insecure contexts (http on LAN) where randomUUID is unavailable.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- snapshot import ----------
/**
 * Replace the local attendee list with a server snapshot.
 * `withPhotos=false` keeps photos already stored locally (light refresh).
 */
export async function importSnapshot(snapshot, { withPhotos = true } = {}) {
  const users = Array.isArray(snapshot.users) ? snapshot.users : [];
  const remote = Array.isArray(snapshot.checkins) ? snapshot.checkins : [];

  await db.transaction('rw', db.users, db.checkins, db.meta, async () => {
    let rows = users;
    if (!withPhotos) {
      const prev = await db.users.bulkGet(users.map((u) => u.id));
      rows = users.map((u, i) => (u.photo ? u : { ...u, photo: prev[i]?.photo ?? null }));
    }
    await db.users.clear();
    await db.users.bulkPut(rows);

    // Refresh remote first-checkins; never overwrite this device's own records.
    await db.checkins.where('source').equals('remote').delete();
    const own = new Set(await db.checkins.where('id').anyOf(remote.map((c) => c.id)).primaryKeys());
    const fresh = remote
      .filter((c) => !own.has(c.id))
      .map((c) => ({ ...c, source: 'remote', status: 'synced' }));
    if (fresh.length) await db.checkins.bulkPut(fresh);

    if (snapshot.publicKey) await setMeta('publicKey', snapshot.publicKey);
    if (snapshot.eventName) await setMeta('eventName', snapshot.eventName);
    await setMeta('lastSnapshotAt', Date.now());
    if (snapshot.serverTime) await setMeta('serverTime', snapshot.serverTime);
  });
  return { users: users.length, checkins: remote.length };
}

// ---------- lookups ----------
export function findUserById(id) {
  return id ? db.users.get(id) : undefined;
}

export function findUserByCode(code) {
  return db.users.where('code').equals(code).first();
}

/** Earliest known check-in for a user (local or remote), or null. */
export async function firstCheckinFor(userId) {
  const list = await db.checkins.where('userId').equals(userId).sortBy('scannedAt');
  return list[0] || null;
}

export async function recordCheckin({ userId, verifiedBy, user }) {
  const [deviceId, deviceName] = await Promise.all([getDeviceId(), getMeta('deviceName', '')]);
  const row = {
    id: uuid(),
    userId,
    scannedAt: Date.now(),
    verifiedBy: verifiedBy || '',
    deviceId,
    deviceName,
    status: 'pending',
    source: 'local',
    // denormalised for the Recent list (works for users not in the snapshot too)
    name: user?.fullName || user?.name || '',
    code: user?.code || '',
  };
  await db.checkins.add(row);
  return row;
}
