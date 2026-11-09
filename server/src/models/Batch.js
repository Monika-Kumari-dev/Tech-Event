import mongoose from 'mongoose';

// One bulk upload (an Excel/CSV file), possibly sent in several chunks.
const batchSchema = new mongoose.Schema(
  {
    _id: { type: String }, // e.g. B-20261109-K3Q9
    fileName: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    created: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false }
);

batchSchema.index({ createdAt: -1 });

export const Batch = mongoose.model('Batch', batchSchema);
