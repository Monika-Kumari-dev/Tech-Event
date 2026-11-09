# QR Pass

Register online → get a signed QR pass → staff verify at the venue **offline** → check-ins sync when internet returns.
Built for 5,000 attendees and multiple gate devices. No APK needed: the web app is an installable PWA.

```
server/   Node.js + Express + MongoDB API          (see server/README.md)
web/      React + Vite + Tailwind PWA              (attendee pages + staff verifier + admin)
CONTRACT.md  API contract shared by both
```

## Run locally

```bash
# 1) API — uses in-memory MongoDB with 50 demo users if MONGODB_URI is empty
cd server && npm install && npm run dev        # http://localhost:4000/api

# 2) Web app — proxies /api to :4000
cd web && npm install && npm run dev           # http://localhost:5173
```

Default staff login (dev): `admin` / `admin123`. Change `ADMIN_PASSWORD` and set `JWT_SECRET` in `server/.env` for production.

| Page | Who | URL |
|---|---|---|
| Landing / Register / My pass / Find pass | Attendees | `/`, `/register`, `/pass/:id`, `/find-pass` |
| Staff login | Staff | `/staff/login` |
| Offline QR verifier | Gate staff | `/verify` |
| Dashboard, attendees, duplicates, CSV, staff | Admin | `/admin` |

## Bulk registration (Admin → Bulk)
1. **Download template** (`TeckFluenceX-attendees-template.xlsx`) — columns: Full Name, Mobile, Email, Organization.
   Other header names (Name, Phone, E-mail, Company…) are recognised automatically; .xlsx, .xls and .csv are accepted.
2. **Upload** the file → preview shows Ready / Error / Duplicate-in-file per row → **Register N attendees**.
   Rows are sent in chunks of 500; already-registered emails/mobiles are skipped, never duplicated.
3. **Results**: created / skipped / failed, with a downloadable error report (.xlsx).
4. **Bulk download** passes for one upload batch or for everyone:
   - **ZIP** of PNG passes (one per attendee, `TFX-XXXXXX_Name.png`) — ~54 KB each
   - **PDF** for printing — 8 badges per A4 page with cut lines, or 1 per page
   - **Excel** list with codes and personal pass links (to mail-merge / WhatsApp)

Bulk-registered attendees are included in the gate phones' offline list on their next sync.

## Event-day checklist (gate phones)
1. Open the site on Wi-Fi, log in at `/staff/login`, name the device (e.g. "Gate 1"), and "Add to Home Screen".
2. Wait until it shows the attendee count (e.g. "5000 attendees") — the list is now stored on the phone.
3. Scan offline. Green = confirm entry, amber = already checked in, red = invalid/cancelled.
4. When internet returns, sync is automatic (or tap **Sync**). Make sure **Pending = 0** before signing out.

## Production
- Host `web/` (build: `npm run build` → `dist/`) and `server/` behind **HTTPS** — the camera requires it.
- Set `MONGODB_URI` (MongoDB Atlas free tier is enough for 5,000 users).
- **Back up `server/keys/`** — the private key signs every QR pass; losing it invalidates all issued passes.
- Duplicate entries across gates while offline can't be blocked in real time; they're flagged after sync in Admin → Check-ins.
