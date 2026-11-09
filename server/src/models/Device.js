import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // deviceId
    deviceName: { type: String, default: '' },
    lastSyncAt: { type: Date, default: null },
    count: { type: Number, default: 0 }, // check-ins received from this device
  },
  { versionKey: false }
);

export const Device = mongoose.model('Device', deviceSchema);
