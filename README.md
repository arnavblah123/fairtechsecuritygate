# Fairtech Gate Register

Gate register PWA for Fairtech Engineers: Dehu (Pune) and Savli (Baroda).

Stack (all on free plans, no card needed): React + Vite + Tailwind on **Vercel**, a single Vercel serverless
function (Hono) as the API, **Neon** Postgres for data, **Vercel Blob** (private store) for photos.

Design and data model: [docs/DESIGN.md](docs/DESIGN.md).

## Setup (one time, about 15 minutes)

### 1. Neon (database)
1. Sign up at neon.com (free plan). Create a project, region **AWS ap-southeast-1 (Singapore)** or the closest available.
2. Open **SQL Editor**, paste the whole of `db/schema.sql`, run it.
3. Dashboard → **Connect** → copy the connection string (it looks like `postgresql://…neon.tech/neondb?sslmode=require`). This is `DATABASE_URL`.

### 2. Vercel (app + API + photos)
1. vercel.com/new → **Import Git Repository** → pick this repo. Framework preset: **Vite**. Leave build settings as detected.
2. Open **Environment Variables** on the import screen and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon connection string |
   | `JWT_SECRET` | any long random text (30+ characters) |
3. Click **Deploy**.
4. Photos: in the project, open **Storage → Create Database → Blob**. Name it `gate-photos`, choose **Private** access, and connect it to the project (all environments). Vercel adds `BLOB_READ_WRITE_TOKEN` to the project by itself.
5. **Deployments → ⋯ → Redeploy** once, so the API picks up the Blob token.

Free limits: Neon 0.5 GB data (years of entries), Vercel Blob 1 GB photos (about 8,000 photos at the app's compression). Photos are deleted after 90 days; if the store fills earlier, the cleanup job removes the oldest first.

### 3. First data (admin)
1. Open `https://<your-app>.vercel.app/admin`. The first visit shows **Create admin account**: enter your email and a password. This form disappears once an admin exists.
2. **Contractors**: add the contractors for each unit.
3. **Labourers**: add name, contractor and photo for each unit.
4. **Guards & PINs**: add each guard with a 4-digit PIN (unique within the unit).

### 4. Guard phone
1. Open the app URL in Chrome → menu → **Add to Home screen**.
2. Open it from the home screen. First time: pick the factory, then the guard enters the PIN.
   The phone is now locked to that unit (visible under Admin → Devices).

## Development (no accounts needed)
```bash
npm install
npm run dev:api   # local API with an in-process Postgres (PGlite) and photos in .local/
npm run dev       # Vite on http://localhost:5173, proxies /api to the local API
```
The local database lives in `.local/pglite`; delete the folder to start fresh.

## Layout
- `src/guard/` guard screens (all text from `src/locales/*.json`)
- `src/admin/` admin pages (English)
- `src/lib/` local database (Dexie), offline sync queue, photos, i18n, API client
- `api/` the serverless API: `api/index.ts` (Vercel entry) and `api/src/` (routes, db, storage, auth)
- `db/schema.sql` tables, triggers, views
- `scripts/dev-server.ts` local API server

## Translations
Edit `src/locales/hi.json`, `mr.json`, `gu.json` (and `en.json`). Keys must match `en.json`; `{n}` style placeholders are filled by the app.

## How offline works
Every tap is saved to the phone's IndexedDB first (rows and photos), then a queue uploads photos and rows in order when internet is available. The home screen shows "N to send". Entries are never dropped: a failed item stays in the queue and can be retried from the sync screen. Row ids are generated on the phone, so a retry can never create a duplicate.

## Security model
- Guards log in with a PIN and get a signed token that carries their unit, guard id and phone id. Every API call filters by the unit in the token, and photo paths must start with that unit. Changing the URL cannot reach the other unit.
- Guards can only insert. OUT, handover and mistake reports go through specific API calls that change only the allowed columns.
- Timestamps are set by database triggers to server time. Whatever the phone sends is overwritten.
- PINs and the admin password are stored as bcrypt hashes. Five wrong PINs lock a phone for 10 minutes.
