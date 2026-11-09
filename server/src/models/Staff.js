import mongoose from 'mongoose';

const staffSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['admin', 'verifier'], default: 'verifier' },
  },
  { timestamps: true }
);

export const Staff = mongoose.model('Staff', staffSchema);
