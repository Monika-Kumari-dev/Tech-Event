# QR Pass — shared contract (backend ⇄ frontend)

Stack: `server/` Node.js + Express + MongoDB (mongoose). `web/` React 19 + Vite + Tailwind v4 PWA.
Scale target: 5,000 registered users, several verifier phones working offline for 1–2 hours.

## Ports / env
- API: `http://localhost:4000`, all routes under `/api`. Vite dev server proxies `/api` → 4000.
- `server/.env`: `PORT=4000`, `MONGODB_URI` (if empty → in-memory MongoDB via mongodb-memory-server, dev only),
  `JWT_SECRET` (staff sessions), `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=admin123`, `EVENT_NAME`.
- ES256 key pair for signing QR passes: generated on first boot into `server/keys/` (gitignored), `kid` = short hash.

## QR pass token
- QR content = a compact JWS (JWT) signed **ES256** by the server.
- Payload: `{ sub: <userId>, code: "QRP-7K3Q9X", name: "Full Name", iat }`, header `{ alg: "ES256", kid }`. No expiry.
- Verifier checks it **offline** with the public JWK (`jose.jwtVerify` + `importJWK`).

## Data
User (public shape):
```json
{ "id": "mongoId", "code": "QRP-7K3Q9X", "fullName": "...", "phone": "...", "email": "...",
  "organization": "...", "photo": "data:image/jpeg;base64,... | null", "status": "active|cancelled",
  "createdAt": "ISO", "checkedIn": false, "checkedInAt": null }
```
- photo: client compresses to ≤ 256px JPEG (~15KB) before upload. Body limit 1mb.
- phone and email are each unique (normalized: email lowercased, phone digits only).

Checkin:
```json
{ "id": "uuid from device", "userId": "...", "deviceId": "...", "deviceName": "Gate 1",
  "verifiedBy": "staff username", "scannedAt": 1731130000000, "duplicate": false }
```

## Endpoints
Errors are always `{ "error": "message", "field"?: "email" }` with a suitable status code.

Public:
- `POST /api/register` body `{ fullName, phone, email, organization?, photo? }`
  → 201 `{ user, qrToken }` · 409 `{ error, field }` if phone/email already registered · 400 validation.
- `POST /api/pass/lookup` body `{ email, phone }` (both must match) → 200 `{ user, qrToken }` · 404.
- `GET /api/public-key` → `{ kid, jwk, eventName }`
- `GET /api/health` → `{ ok: true, time }`

Staff (header `Authorization: Bearer <staffToken>`; staff token is HS256, valid 24h so it keeps working offline):
- `POST /api/staff/login` body `{ username, password }` → `{ token, staff: { username, name, role: "admin|verifier" } }`
- `GET /api/sync/snapshot?photos=1` → `{ serverTime, eventName, publicKey: { kid, jwk }, users: [User], checkins: [Checkin] }`
  (checkins = first valid check-in per user, so every device learns who is already verified.)
- `POST /api/sync/checkins` body `{ deviceId, deviceName, checkins: [{ id, userId, scannedAt, verifiedBy }] }` (≤ 200 per call)
  → `{ accepted: ["id"...], duplicates: [{ id, userId, firstCheckin: Checkin }], serverTime }`
  Idempotent: re-sending the same check-in id is a no-op (counted as accepted). First check-in per user wins (earliest scannedAt);
  later ones stored with `duplicate: true`.

Admin (staff role admin):
- `GET /api/admin/stats` → `{ totalUsers, checkedIn, pending, duplicates, registrationsToday,
   devices: [{ deviceId, deviceName, count, lastSyncAt }], recent: [Checkin & { user: {fullName, code} }] , hourly: [{ hour: "ISO", count }] }`
- `GET /api/admin/users?search=&status=all|checked|pending&page=1&limit=25` → `{ items: [User], total, page, pages }`
- `GET /api/admin/duplicates` → `{ items: [{ checkin, user, firstCheckin }] }`
- `PATCH /api/admin/users/:id` body `{ status }` → `{ user }`
- `GET /api/admin/export.csv` → CSV of all users with check-in status/time/device.
- **Bulk registration** `POST /api/admin/users/bulk` (JSON body limit 5mb) body
  `{ batchId?, fileName?, rows: [{ row, fullName, phone, email, organization? }] }` (≤ 1000 rows per call; client chunks by 500).
  `row` = spreadsheet row number, echoed back. Omit `batchId` on the first chunk; server creates one (e.g. `B-20261109-K3Q9`) and
  returns it — send it on the following chunks of the same file.
  → 200 `{ batchId, created: [{ row, user, qrToken }], skipped: [{ row, field, error }], failed: [{ row, field?, error }] }`
  - skipped = email/phone already registered (in DB, or earlier in the same batch). failed = validation error.
  - Created users have `batchId` and `source: "bulk"` (self-registered: `source: "self"`, `batchId: null`).
- `GET /api/admin/batches` → `{ items: [{ batchId, fileName, createdBy, createdAt, created, skipped, failed }] }` newest first.
- **Bulk passes** `POST /api/admin/passes` body `{ batchId? | ids?: [userId] | all?: true }`
  → `{ items: [{ user, qrToken }] }` (user without photo, sorted by fullName, max 10,000). Used by the client to render QR PNG/PDF/Excel.
- `POST /api/admin/staff` body `{ username, password, name, role }` → `{ staff }`; `GET /api/admin/staff` → `{ items }`

## Frontend routes (web/src)
- `/` Landing · `/register` · `/pass/:id` (my QR pass) · `/find-pass`   → `src/pages/public/*`
- `/staff/login` · `/verify` (offline scanner) · `/admin` (dashboard)     → `src/pages/staff/*`
- Shared: `src/lib/api.js`, `src/components/ui.jsx`, design tokens in `src/index.css`.
