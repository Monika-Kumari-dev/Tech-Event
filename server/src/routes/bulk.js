// Bulk registration from Excel/CSV + bulk pass (QR token) generation. Mounted inside the admin router.
import crypto from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import { User, Batch } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { generateCode, CODE_ALPHABET } from '../lib/code.js';
import { validateRegistration } from '../lib/validate.js';
import { toPublicUser } from '../lib/serialize.js';
import { firstCheckinMap } from '../lib/checkins.js';
import { signPass } from '../keys.js';

const router = Router();

const MAX_ROWS_PER_CALL = 1000;
const MAX_PASSES = 10_000;

function newBatchId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `B-${d}-${s}`;
}

const toBatch = (b) => ({
  batchId: b._id,
  fileName: b.fileName,
  createdBy: b.createdBy,
  createdAt: b.createdAt?.toISOString?.() ?? null,
  created: b.created,
  skipped: b.skipped,
  failed: b.failed,
});

router.post('/users/bulk', async (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'rows must be a non-empty array', 'rows');
  if (rows.length > MAX_ROWS_PER_CALL) throw new HttpError(400, `At most ${MAX_ROWS_PER_CALL} rows per request`, 'rows');

  // Batch: create on the first chunk, reuse on later chunks of the same file.
  let batchId = typeof req.body.batchId === 'string' ? req.body.batchId.trim() : '';
  if (batchId) {
    if (!(await Batch.exists({ _id: batchId }))) throw new HttpError(404, 'Unknown batchId', 'batchId');
  } else {
    batchId = newBatchId();
    await Batch.create({
      _id: batchId,
      fileName: typeof req.body.fileName === 'string' ? req.body.fileName.slice(0, 200) : '',
      createdBy: req.staff?.username || '',
    });
  }

  const failed = [];
  const skipped = [];
  const candidates = []; // { row, data }
  const seenEmail = new Map();
  const seenPhone = new Map();

  rows.forEach((r, i) => {
    const row = Number.isFinite(Number(r?.row)) ? Number(r.row) : i + 1;
    let data;
    try {
      // Excel cells may be numbers; photos are not accepted in bulk.
      data = validateRegistration({
        fullName: r?.fullName != null ? String(r.fullName) : '',
        email: r?.email != null ? String(r.email) : '',
        phone: r?.phone,
        organization: r?.organization != null && r.organization !== '' ? String(r.organization) : undefined,
      }, { requireEmail: true });
    } catch (err) {
      if (err instanceof HttpError) return failed.push({ row, field: err.field, error: err.message });
      throw err;
    }
    if (seenEmail.has(data.email)) return skipped.push({ row, field: 'email', error: `Duplicate email in file (row ${seenEmail.get(data.email)})` });
    if (seenPhone.has(data.phone)) return skipped.push({ row, field: 'phone', error: `Duplicate mobile in file (row ${seenPhone.get(data.phone)})` });
    seenEmail.set(data.email, row);
    seenPhone.set(data.phone, row);
    candidates.push({ row, data });
  });

  // Already registered (self-registered, or in an earlier chunk/batch).
  if (candidates.length) {
    const existing = await User.find(
      { $or: [{ email: { $in: candidates.map((c) => c.data.email) } }, { phone: { $in: candidates.map((c) => c.data.phone) } }] },
      { email: 1, phone: 1 }
    ).lean();
    const emails = new Set(existing.map((u) => u.email));
    const phones = new Set(existing.map((u) => u.phone));
    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      const field = emails.has(c.data.email) ? 'email' : phones.has(c.data.phone) ? 'phone' : null;
      if (field) {
        skipped.push({ row: c.row, field, error: field === 'email' ? 'Email already registered' : 'Mobile already registered' });
        candidates.splice(i, 1);
      }
    }
  }

  // Insert; retry only rows that lost a pass-code collision. Email/phone races become "skipped".
  const created = [];
  let pending = candidates;
  for (let attempt = 0; attempt < 4 && pending.length; attempt++) {
    // Not `lean`: lean insertMany skips schema defaults and timestamps (status, createdAt).
    const docs = pending.map((c) => ({ ...c.data, photo: null, status: 'active', code: generateCode(), source: 'bulk', batchId }));
    let writeErrors = [];
    try {
      await User.insertMany(docs, { ordered: false });
    } catch (err) {
      if (!err?.writeErrors && err?.code !== 11000) throw err;
      writeErrors = err.writeErrors || [err];
    }
    const failedIdx = new Map(writeErrors.map((we) => [we.index ?? we.err?.index, we]));
    const retry = [];
    pending.forEach((c, i) => {
      const we = failedIdx.get(i);
      if (!we) return;
      const keyPattern = we.err?.keyPattern || we.keyPattern || {};
      const msg = String(we.errmsg || we.err?.errmsg || we.message || '');
      const field = Object.keys(keyPattern)[0] || (msg.includes('email') ? 'email' : msg.includes('phone') ? 'phone' : msg.includes('code') ? 'code' : null);
      if (field === 'code') retry.push(c);
      else if (field === 'email' || field === 'phone') skipped.push({ row: c.row, field, error: `${field === 'email' ? 'Email' : 'Mobile'} already registered` });
      else failed.push({ row: c.row, error: 'Could not save this row' });
    });
    const handled = new Set([...failedIdx.keys()]);
    const okEmails = pending.filter((_, i) => !handled.has(i)).map((c) => c.data.email);
    if (okEmails.length) {
      const inserted = await User.find({ email: { $in: okEmails }, batchId }, { photo: 0 }).lean();
      const byEmail = new Map(inserted.map((u) => [u.email, u]));
      for (const c of pending) {
        const u = byEmail.get(c.data.email);
        if (u) created.push({ row: c.row, u });
      }
    }
    pending = retry;
  }
  for (const c of pending) failed.push({ row: c.row, error: 'Could not allocate a pass code, please retry' });

  const signed = await Promise.all(created.map(async ({ row, u }) => ({ row, user: toPublicUser(u), qrToken: await signPass(u) })));
  signed.sort((a, b) => a.row - b.row);
  skipped.sort((a, b) => a.row - b.row);
  failed.sort((a, b) => a.row - b.row);

  await Batch.updateOne({ _id: batchId }, { $inc: { created: signed.length, skipped: skipped.length, failed: failed.length } });
  res.json({ batchId, created: signed, skipped, failed });
});

router.get('/batches', async (_req, res) => {
  const items = await Batch.find().sort({ createdAt: -1 }).limit(200).lean();
  res.json({ items: items.map(toBatch) });
});

router.post('/passes', async (req, res) => {
  const { batchId, ids, all } = req.body || {};
  let filter;
  if (typeof batchId === 'string' && batchId) filter = { batchId };
  else if (Array.isArray(ids) && ids.length) {
    const valid = ids.filter((id) => mongoose.isValidObjectId(id));
    if (!valid.length) throw new HttpError(400, 'No valid ids', 'ids');
    filter = { _id: { $in: valid } };
  } else if (all === true) filter = {};
  else throw new HttpError(400, 'Provide batchId, ids or all: true');

  const [users, firsts] = await Promise.all([
    User.find(filter, { photo: 0 }).sort({ fullName: 1 }).limit(MAX_PASSES).collation({ locale: 'en' }).lean(),
    firstCheckinMap(),
  ]);
  const items = await Promise.all(
    users.map(async (u) => ({ user: toPublicUser(u, firsts.get(String(u._id)) || null), qrToken: await signPass(u) }))
  );
  res.json({ items });
});

export default router;
