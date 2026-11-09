import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Staff } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { signStaffToken } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';

const router = Router();

export const toStaff = (s) => ({ id: String(s._id), username: s.username, name: s.name || '', role: s.role, createdAt: s.createdAt ?? null });

router.post('/login', loginLimiter, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username) throw new HttpError(400, 'Username is required', 'username');
  if (!password) throw new HttpError(400, 'Password is required', 'password');

  const staff = await Staff.findOne({ username }).lean();
  const ok = staff && (await bcrypt.compare(password, staff.passwordHash));
  if (!ok) throw new HttpError(401, 'Invalid username or password');

  const token = await signStaffToken(staff);
  res.json({ token, staff: { username: staff.username, name: staff.name || '', role: staff.role } });
});

export default router;
