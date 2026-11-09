import { HttpError } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_PHOTO_CHARS = 280_000; // ~200KB of binary once base64-encoded

export const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
export const normalizePhone = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '');

export function validateRegistration(body = {}, { requireEmail = false } = {}) {
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
  if (fullName.length < 2 || fullName.length > 80) throw new HttpError(400, 'Full name must be 2–80 characters', 'fullName');

  const email = normalizeEmail(body.email);
  if ((requireEmail && !email) || (email && (email.length > 254 || !EMAIL_RE.test(email)))) throw new HttpError(400, 'Enter a valid email address', 'email');

  const phone = normalizePhone(body.phone);
  if (phone.length < 10 || phone.length > 15) throw new HttpError(400, 'Phone must have 10–15 digits', 'phone');

  let organization = '';
  if (body.organization != null) {
    if (typeof body.organization !== 'string') throw new HttpError(400, 'Organization must be text', 'organization');
    organization = body.organization.trim();
    if (organization.length > 100) throw new HttpError(400, 'Organization must be at most 100 characters', 'organization');
  }

  let photo = null;
  if (body.photo != null && body.photo !== '') {
    if (typeof body.photo !== 'string' || !PHOTO_RE.test(body.photo)) {
      throw new HttpError(400, 'Photo must be a JPEG, PNG or WebP image', 'photo');
    }
    if (body.photo.length > MAX_PHOTO_CHARS) throw new HttpError(400, 'Photo is too large (max ~200KB)', 'photo');
    photo = body.photo;
  }

  const relationships = ['wife', 'husband', 'mother', 'father', 'uncle', 'aunt', 'brother', 'sister', 'grandparent', 'other'];
  const family = {};
  for (const field of ['adults', 'kids']) {
    const members = body[field] ?? [];
    if (!Array.isArray(members) || members.length > 5) throw new HttpError(400, `You can add up to 5 ${field}`, field);
    family[field] = members.map((member) => {
      const name = typeof member?.name === 'string' ? member.name.trim().replace(/\s+/g, ' ') : '';
      if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Each family member needs a name of 2–80 characters', field);
      if (field === 'adults' && !relationships.includes(member.relationship)) throw new HttpError(400, 'Select a relationship for each adult', field);
      return { name, ...(field === 'adults' ? { relationship: member.relationship } : {}) };
    });
  }
  return { fullName, ...(email ? { email } : {}), phone, organization, photo, ...family };
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
