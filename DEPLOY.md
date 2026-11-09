# Deploying Teck Fluence X — everything on Netlify

```
Browser ──► Netlify ─┬─ website (web/dist, HTTPS)
                     └─ /api/*  →  Netlify Function (server/ Express API)  ──►  MongoDB Atlas
```
One Netlify site serves the website **and** the backend. The database is MongoDB Atlas (free).
All Netlify settings live in `netlify.toml` — nothing to type in the build settings.

## 1. Code on GitHub
```bash
cd ~/Desktop/QRPRoject
git init && git add . && git status     # must NOT list server/.env, server/keys/, node_modules
git commit -m "Teck Fluence X"
git branch -M main
git remote add origin https://github.com/<you>/teck-fluence-x.git
git push -u origin main
```

## 2. MongoDB Atlas (free)
1. cloud.mongodb.com → create a free **M0** cluster (region near your users, e.g. Mumbai).
2. Create a database user + password.
3. **Network Access → Add IP → Allow access from anywhere (0.0.0.0/0)** (Netlify has no fixed IP).
4. **Connect → Drivers** → copy the URI, insert the password and the db name `teckfluencex`:
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/teckfluencex?retryWrites=true&w=majority`

## 3. Secrets
```bash
cd server && npm run deploy-env
```
Save `QR_PRIVATE_JWK` and `JWT_SECRET` in a password manager. **Losing `QR_PRIVATE_JWK` invalidates all issued passes.**

## 4. Netlify
1. app.netlify.com → **Add new site → Import an existing project → GitHub** → pick the repo.
2. Build settings are pre-filled from `netlify.toml` — leave them.
3. Click **Add environment variables** (or later: Site configuration → Environment variables) and add:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | Atlas URI from step 2 |
   | `QR_PRIVATE_JWK` | from step 3 |
   | `JWT_SECRET` | from step 3 |
   | `ADMIN_USERNAME` | `admin` |
   | `ADMIN_PASSWORD` | a strong password (used to create the first admin) |
   | `EVENT_NAME` | `Teck Fluence X` |

4. **Deploy**. If you added the variables after the first deploy: **Deploys → Trigger deploy → Deploy site**.
5. Optional: **Site configuration → Change site name** → `teckfluencex` → `https://teckfluencex.netlify.app`.

## 5. Check
| Open | Expect |
|---|---|
| `https://<site>.netlify.app/api/health` | `{"ok":true,…}` |
| Register a test attendee | QR pass appears |
| `/staff/login` → `admin` + your password | Admin dashboard |
| Admin → Staff | create gate accounts (`gate1`, `gate2`, …) |
| Phone → login as gate → Start verifying | camera scanner works (HTTPS) |

Errors? **Netlify → Logs → Functions → api** shows backend logs (e.g. `MONGODB_URI is required`, Atlas `bad auth`).

## Limits worth knowing (fine for 5,000 attendees)
- Each API call must finish in 10 s and respond with < 6 MB — measured: 5,000 passes ≈ 2.7 MB, gate list ≈ 1.4 MB.
  Attendee photos in the gate list are capped at 4 MB in total; extra photos show initials instead.
- Free plan: 125k function calls/month — plenty (registration, sync every minute per gate, dashboard).
- First request after idle takes ~1 s (cold start), then it's fast.

## Updating
`git push` → Netlify rebuilds website + API automatically. Phones pick up the new version on next open.

---
*Alternative:* `render.yaml` can run the API on Render instead (long-running server). Then change the `/api/*`
redirect in `netlify.toml` to `https://<your-render-app>.onrender.com/api/:splat` and remove the `functions` line.
