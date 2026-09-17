# Fairtech Gate Register

Gate register PWA for Fairtech Engineers: Dehu (Pune) and Savli (Baroda).

Stack (all on free plans, no card needed): React + Vite + Tailwind on **Vercel**, a single Vercel serverless
function (Hono) as the API, **Neon** Postgres for data, **Backblaze B2** for photos.

Design and data model: [docs/DESIGN.md](docs/DESIGN.md).

## Setup (one time, about 20 minutes)

### 1. Neon (database)
1. Sign up at neon.com (free plan). Create a project, region **AWS ap-southeast-1 (Singapore)** or the closest available.
2. Open **SQL Editor**, paste the whole of `db/schema.sql`, run it.
3. Dashboard → **Connect** → copy the connection string (it looks like `postgresql://…neon.tech/neondb?sslmode=require`). This is `DATABASE_URL`.

### 2. Backblaze B2 (photos)
1. Sign up at backblaze.com → B2 Cloud Storage (first 10 GB free).
2. **Buckets → Create a bucket**: name e.g. `fairtech-gate-photos`, **Private**. Note the endpoint shown on the bucket
   (e.g. `s3.us-west-004.backblazeb2.com`); the region is the middle part (`us-west-004`).
3. **Application Keys → Add a new application key**: allow access to that bucket only, Read and Write. Copy the `keyID` and `applicationKey` (shown once).

### 3. Vercel (app + API)
1. Import this repo. Framework preset: **Vite**. Leave build settings as detected.
2. Settings → Environment Variables (see `.env.example`):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon connection string |
   | `JWT_SECRET` | any long random text (30+ characters) |
   | `S3_ENDPOINT` | `https://s3.<region>.backblazeb2.com` |
   | `S3_REGION` | e.g. `us-west-004` |
   | `S3_BUCKET` | your bucket name |
   | `S3_ACCESS_KEY_ID` | B2 keyID |
   | `S3_SECRET_ACCESS_KEY` | B2 applicationKey |
3. Deploy.

### 4. First data (admin)
1. Open `https://<your-app>.vercel.app/admin`. The first visit shows **Create admin account**: enter your email and a password. This form disappears once an admin exists.
2. **Contractors**: add the contractors for each unit.
3. **Labourers**: add name, contractor and photo for each unit.
4. **Guards & PINs**: add each guard with a 4-digit PIN (unique within the unit).

### 5. Guard phone
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
