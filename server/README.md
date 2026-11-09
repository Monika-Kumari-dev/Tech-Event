# QR Pass — API server

Express 5 + MongoDB (mongoose) backend. Attendees register online and get an **ES256-signed JWT** as their QR pass;
verifier phones download a snapshot, scan offline, and sync their check-ins back later.

The API is specified in [`../CONTRACT.md`](../CONTRACT.md). One addition: `POST /api/sync/checkins` also returns
`rejected: [{ id, reason }]` for check-ins it could not store (unknown user, invalid id/scannedAt).

## Setup

```bash
cd server
npm install
cp .env.example .env     # edit as needed
npm run dev              # node --watch, http://localhost:4000/api
# npm start              # production
```

If `MONGODB_URI` is empty the server starts an **in-memory MongoDB** (mongodb-memory-server; the first run downloads a
mongod binary). Data is lost on every restart. `SEED_DEMO=50` adds that many demo users at boot in this mode.

On first boot the server creates `keys/private.jwk.json` and `keys/public.jwk.json` (ES256, `kid` = first 8 chars of
the JWK thumbprint) and reuses them later. An admin staff account is created from `ADMIN_USERNAME` / `ADMIN_PASSWORD`
when there are no staff yet.

## Environment

| Var | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `MONGODB_URI` | empty | empty means in-memory dev DB |
| `JWT_SECRET` | generated | HS256 secret for 24h staff tokens. If unset, a random one is saved to `keys/jwt-secret.txt` with a warning |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | seeded once |
| `EVENT_NAME` | `QR Pass Event` | |
| `CORS_ORIGIN` | any | comma-separated allow-list |
| `TRUST_PROXY` | empty | set to `1` behind a reverse proxy so rate limits see real client IPs |
| `SEED_DEMO` | `0` | demo users to create at boot (in-memory mode only) |

### MongoDB Atlas

The Atlas free tier (M0) is plenty for 5,000 users. Create a cluster and a database user, allow your server's IP, then:

```
MONGODB_URI=mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/qrpass?retryWrites=true&w=majority
```

Load test: `npm run seed -- 5000` inserts 5,000 fake users. It needs a real `MONGODB_URI`.

## Production notes

- **Run behind HTTPS** (a reverse proxy or a platform TLS terminator) and set `TRUST_PROXY=1`. The verifier PWA needs
  HTTPS for camera access anyway.
- Set `MONGODB_URI`, a strong `JWT_SECRET` and a non-default `ADMIN_PASSWORD`.
- **Back up `keys/`.** If you lose the private key, every pass already issued becomes invalid. Keep it secret, since
  anyone who has it can forge passes.
- Rate limits (per IP, 15 min): register 30, pass lookup 30, staff login 20.

## Layout

```
src/index.js          boot: db, indexes, keys, seeding, listen
src/app.js            express app (helmet, cors, compression, morgan, json 1mb)
src/config.js  src/db.js  src/keys.js  src/seed.js
src/models/           User, Checkin (_id = device uuid), Device, Staff
src/routes/           public, staff, sync, admin
src/middleware/       auth (HS256 staff tokens, roles), rateLimit, errors
src/lib/              validation, serializers, check-in dedupe logic, code generator
scripts/seed.js       npm run seed -- N
```
