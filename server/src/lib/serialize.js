const ms = (d) => (d ? new Date(d).getTime() : null);
const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Public check-in shape (scannedAt as epoch ms, per CONTRACT.md). */
export function toCheckin(c) {
  if (!c) return null;
  return {
    id: c._id,
    userId: String(c.userId),
    deviceId: c.deviceId,
    deviceName: c.deviceName || '',
    verifiedBy: c.verifiedBy || '',
    scannedAt: ms(c.scannedAt),
    syncedAt: ms(c.syncedAt),
    duplicate: !!c.duplicate,
  };
}

/** Public user shape. `first` = the user's first (non-duplicate) check-in, if any. */
export function toPublicUser(u, first = null) {
  return {
    id: String(u._id),
    code: u.code,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email || '',
    adults: u.adults || [],
    kids: u.kids || [],
    organization: u.organization || '',
    photo: u.photo ?? null,
    status: u.status,
    source: u.source || 'self',
    batchId: u.batchId ?? null,
    createdAt: iso(u.createdAt),
    checkedIn: !!first,
    checkedInAt: first ? iso(first.scannedAt) : null,
  };
}
