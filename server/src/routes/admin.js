import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Checkin, Device, Staff } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { toCheckin, toPublicUser } from '../lib/serialize.js';
import { escapeRegex, normalizePhone } from '../lib/validate.js';
import { firstCheckinMap, firstCheckinFor } from '../lib/checkins.js';
import { requireStaff, requireRole } from '../middleware/auth.js';
import { toStaff } from './staff.js';
import bulkRoutes from './bulk.js';

const router = Router();
router.use(requireStaff, requireRole('admin'));
router.use(bulkRoutes);

const HOUR = 60 * 60 * 1000;

router.get('/stats', async (_req, res) => {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const windowStart = Math.floor(now / HOUR) * HOUR - 11 * HOUR;

  const [totalUsers, checkedIn, duplicates, registrationsToday, devices, recentRaw, windowRows] = await Promise.all([
    User.countDocuments(),
    Checkin.countDocuments({ duplicate: false }),
    Checkin.countDocuments({ duplicate: true }),
    User.countDocuments({ createdAt: { $gte: startOfToday } }),
    Device.find().sort({ lastSyncAt: -1 }).lean(),
    Checkin.find().sort({ scannedAt: -1 }).limit(10).lean(),
    Checkin.find({ duplicate: false, scannedAt: { $gte: new Date(windowStart) } }, { scannedAt: 1 }).lean(),
  ]);

  const recentUsers = await User.find({ _id: { $in: recentRaw.map((c) => c.userId) } }, { fullName: 1, code: 1 }).lean();
  const userById = new Map(recentUsers.map((u) => [String(u._id), u]));

  const buckets = Array.from({ length: 12 }, (_, i) => ({ hour: new Date(windowStart + i * HOUR).toISOString(), count: 0 }));
  for (const r of windowRows) {
    const idx = Math.floor((r.scannedAt.getTime() - windowStart) / HOUR);
    if (idx >= 0 && idx < 12) buckets[idx].count++;
  }

  res.json({
    totalUsers,
    checkedIn,
    pending: Math.max(0, totalUsers - checkedIn),
    duplicates,
    registrationsToday,
    devices: devices.map((d) => ({
      deviceId: d._id,
      deviceName: d.deviceName,
      count: d.count,
      lastSyncAt: d.lastSyncAt ? d.lastSyncAt.toISOString() : null,
    })),
    recent: recentRaw.map((c) => {
      const u = userById.get(String(c.userId));
      return { ...toCheckin(c), user: u ? { fullName: u.fullName, code: u.code } : null };
    }),
    hourly: buckets,
  });
});

router.get('/users', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = ['checked', 'pending'].includes(req.query.status) ? req.query.status : 'all';
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));

  const filter = {};
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    const or = [{ fullName: rx }, { email: rx }, { code: rx }, { organization: rx }];
    const digits = normalizePhone(search);
    if (digits.length >= 3) or.push({ phone: new RegExp(digits) });
    filter.$or = or;
  }
  if (status !== 'all') {
    const checkedIds = await Checkin.distinct('userId', { duplicate: false });
    filter._id = status === 'checked' ? { $in: checkedIds } : { $nin: checkedIds };
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  const firsts = await firstCheckinMap(users.map((u) => u._id));

  res.json({
    items: users.map((u) => toPublicUser(u, firsts.get(String(u._id)))),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.patch('/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'User not found');
  const { status } = req.body ?? {};
  if (!['active', 'cancelled'].includes(status)) throw new HttpError(400, 'status must be active or cancelled', 'status');
  const user = await User.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true }).lean();
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user: toPublicUser(user, await firstCheckinFor(user._id)) });
});

router.get('/duplicates', async (_req, res) => {
  const dups = await Checkin.find({ duplicate: true }).sort({ scannedAt: -1 }).limit(1000).lean();
  const userIds = [...new Set(dups.map((c) => String(c.userId)))];
  const [users, firsts] = await Promise.all([
    User.find({ _id: { $in: userIds } }).lean(),
    firstCheckinMap(userIds),
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));
  res.json({
    items: dups.map((c) => {
      const uid = String(c.userId);
      const u = userById.get(uid);
      const first = firsts.get(uid);
      return { checkin: toCheckin(c), user: u ? toPublicUser(u, first) : null, firstCheckin: toCheckin(first) };
    }),
  });
});

const csvCell = (v) => {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/export.csv', async (_req, res) => {
  const [users, firsts] = await Promise.all([
    User.find({}, { photo: 0 }).sort({ createdAt: 1 }).lean(),
    firstCheckinMap(),
  ]);
  const header = ['code', 'fullName', 'email', 'phone', 'organization', 'status', 'registeredAt', 'checkedIn', 'checkedInAt', 'device', 'verifiedBy'];
  const lines = [header.join(',')];
  for (const u of users) {
    const f = firsts.get(String(u._id));
    lines.push(
      [
        u.code, u.fullName, u.email, u.phone, u.organization, u.status,
        u.createdAt?.toISOString(),
        f ? 'yes' : 'no',
        f ? f.scannedAt.toISOString() : '',
        f ? f.deviceName || f.deviceId : '',
        f ? f.verifiedBy : '',
      ].map(csvCell).join(',')
    );
  }
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="teck-fluence-x-attendees-${date}.csv"`);
  res.send('﻿' + lines.join('\r\n') + '\r\n');
});

router.get('/staff', async (_req, res) => {
  const items = await Staff.find({}, { passwordHash: 0 }).sort({ createdAt: 1 }).lean();
  res.json({ items: items.map(toStaff) });
});

router.post('/staff', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  const role = req.body?.role ?? 'verifier';
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new HttpError(400, 'Username must be 3–32 characters (a-z, 0-9, . _ -)', 'username');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters', 'password');
  if (!['admin', 'verifier'].includes(role)) throw new HttpError(400, 'role must be admin or verifier', 'role');
  if (await Staff.exists({ username })) throw new HttpError(409, 'Username already exists', 'username');

  try {
    const staff = await Staff.create({ username, name, role, passwordHash: await bcrypt.hash(password, 10) });
    res.status(201).json({ staff: toStaff(staff) });
  } catch (err) {
    if (err?.code === 11000) throw new HttpError(409, 'Username already exists', 'username');
    throw err;
  }
});

export default router;
