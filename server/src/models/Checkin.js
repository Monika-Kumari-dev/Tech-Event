import mongoose from 'mongoose';

const checkinSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // uuid generated on the device (idempotency key)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    deviceName: { type: String, default: '' },
    verifiedBy: { type: String, default: '' },
    scannedAt: { type: Date, required: true },
    syncedAt: { type: Date, default: () => new Date() },
    duplicate: { type: Boolean, default: false },
  },
  { versionKey: false }
);

checkinSchema.index({ userId: 1, scannedAt: 1 });
checkinSchema.index({ scannedAt: -1 });
// At most one "first" (non-duplicate) check-in per user — guards against concurrent syncs.
checkinSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { duplicate: false }, name: 'first_checkin_per_user' });

export const Checkin = mongoose.model('Checkin', checkinSchema);
