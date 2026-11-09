import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, match: /^\d{10,15}$/ },
    organization: { type: String, trim: true, maxlength: 100, default: '' },
    adults: { type: [{ _id: false, name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 }, relationship: { type: String, required: true, enum: ['wife', 'husband', 'mother', 'father', 'uncle', 'aunt', 'brother', 'sister', 'grandparent', 'other'] } }], default: [], validate: [(v) => v.length <= 5, 'Maximum 5 adults'] },
    kids: { type: [{ _id: false, name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 } }], default: [], validate: [(v) => v.length <= 5, 'Maximum 5 kids'] },
    photo: { type: String, default: null },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
    source: { type: String, enum: ['self', 'bulk'], default: 'self' },
    batchId: { type: String, default: null, index: true },
  },
  { timestamps: true, autoIndex: false }
);

userSchema.index({ createdAt: -1 });

export const User = mongoose.model('User', userSchema);
