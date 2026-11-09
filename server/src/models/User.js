import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, match: /^\d{10,15}$/ },
    organization: { type: String, trim: true, maxlength: 100, default: '' },
    photo: { type: String, default: null },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
    source: { type: String, enum: ['self', 'bulk'], default: 'self' },
    batchId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

userSchema.index({ createdAt: -1 });

export const User = mongoose.model('User', userSchema);
