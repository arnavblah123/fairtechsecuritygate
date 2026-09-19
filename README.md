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
   | `GATE_DATABASE_URL` | Neon connection string of this app's project |
   | `GATE_JWT_SECRET` | any long random text (30+ characters) |
   | `GATE_PRODUCTION_DATABASE_URL` | optional: connection string of the **production app's** Neon project, to mirror its employee list (see below) |

   Names start with `GATE_` so they never clash with variables shared by your other apps. (`DATABASE_URL` and `JWT_SECRET` still work as fallbacks.)
3. Click **Deploy**.
4. Photos: in the project, open **Storage → Create Database → Blob**. Name it `gate-photos`, choose **Private** access, and connect it to the project (all environments). Vercel adds `BLOB_READ_WRITE_TOKEN` to the project by itself.
5. **Deployments → ⋯ → Redeploy** once, so the API picks up the Blob token.

Free limits: Neon 0.5 GB data (years of entries), Vercel Blob 1 GB photos (about 8,000 photos at the app's compression). Photos are deleted after 90 days; if the store fills earlier, the cleanup job removes the oldest first.

### 3. Live link to the production app (recommended)
People are managed in the production app; the gate app only mirrors them. Set `GATE_PRODUCTION_DATABASE_URL` to the
production app's Neon connection string (Neon console → that project → Connect → copy). The gate app then reads its
`Employee` table (name, code, skill, unit, active) once an hour and whenever you press **Sync from production now**
in Admin → Labourers. It never writes to the production database.

- Dehu Unit-2 → Dehu, Savli Unit-3 → Savli. Employees of other units (Chinchwad Unit-1) and inactive employees are kept as *inactive* here.
- Names of mirrored people cannot be edited in the gate app (change them in the production app). Photos and gate entries stay here.
- A person a guard adds with NEW PERSON is linked automatically once the same name appears in the production app for that unit.
- Safer option: in the production Neon project create a read-only role (Neon → Roles) and use its connection string.

### 4. Load your other lists (one time)
Easiest: open the **Raw** view of `db/setup_all.sql` on GitHub (the Raw button, not the normal code view, which
only copies part of a long file), select all, copy, paste into the Neon SQL editor, Run. It contains the three
files below in the right order and is safe to re-run.

Or run them one by one in the Neon SQL editor, in this order. All are safe to re-run.
1. `db/schema.sql` again (adds the companies table and name uniqueness).
2. `db/seed_from_production.sql` (skip if the live link is set): the 70 people from the production app's roster file
   (Dehu Unit-2 → Dehu, Savli Unit-3 → Savli; Chinchwad Unit-1 people go to Dehu as *inactive*, reactivate the ones
   who use the Dehu gate) and 5 office staff for the visitor "whom to meet" list.
3. `db/seed_from_drive.sql`: 67 companies from the purchase vendor list, 12 labour contractors.
- **Labourers, more contractors, more companies**: Admin → **Import**. Paste rows copied from Excel or Google Sheets
  (one per line: `name, contractor` for labourers; `name, category, unit` for companies) or pick a CSV file.
  Names that already exist are skipped.
- If a list lives in another app's Supabase project: Table Editor → open the table → **Export → CSV**, then use Import.

### 5. First data (admin)
1. Open `https://<your-app>.vercel.app/admin`. The first visit shows **Create admin account**: enter your email and a password. This form disappears once an admin exists.
2. **Contractors**: add the contractors for each unit.
3. **Labourers**: add name, contractor and photo for each unit.
4. **Guards & PINs**: add each guard with a 4-digit PIN (unique within the unit).

### 6. Guard phone
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

## Labourer names in Hindi / Marathi / Gujarati
Every labourer has `name` (English, as in the production app) and `name_hi` (Devanagari). The API fills `name_hi`
automatically (`api/_lib/translit.ts`: a dictionary of common Indian names plus phonetic rules) whenever a name arrives
from the production app, the admin pages, the Import page or a guard's NEW PERSON. The phone shows the Devanagari name
big with the English name under it when the language is Hindi or Marathi, converts it to Gujarati script for Gujarati, and
the search box matches either script. If a generated name is wrong, correct it in **Admin → Labourers → Edit** (the
"Name in Hindi / Marathi" column); clearing the box regenerates it.

> After pulling this change, run `db/schema.sql` again in the Neon SQL editor: it adds the `name_hi` column and fixes the
> `stamp_entry` trigger (visitor entries failed before this fix).

## Gate rules the app enforces
- **Labour status.** The grid and the IN/OUT screen show whether the person is inside (with the IN time) or outside (last
  OUT time). The big button is always the expected next direction. If the guard uses the small link to press IN on someone
  already IN (or OUT on someone already OUT), the app warns him in his language and asks to confirm; the entry is then
  saved with a `flag` (`double_in` / `double_out`), the guard sees "office has been informed", and the admin Live page
  lists it in red. The server decides the flag from its own record, so a stale phone cannot hide or invent one.
- **Vehicles.** Material IN needs the challan photo at entry. Material OUT / Scrap OUT are entered immediately with only
  the plate photo; the loaded-vehicle photo is taken at the gate later (any time after loading, from the vehicle's page)
  and OUT is not possible until it exists. No gate pass photo. A vehicle that came in empty is asked "going out loaded?"
  at OUT (photo if yes).
- **Camera.** Never opens by itself; the guard presses the photo button.

## How offline works
Every tap is saved to the phone's IndexedDB first (rows and photos), then a queue uploads photos and rows in order when internet is available. The home screen shows "N to send". Entries are never dropped: a failed item stays in the queue and can be retried from the sync screen. Row ids are generated on the phone, so a retry can never create a duplicate.

## Security model
- Guards log in with a PIN and get a signed token that carries their unit, guard id and phone id. Every API call filters by the unit in the token, and photo paths must start with that unit. Changing the URL cannot reach the other unit.
- Guards can only insert. OUT, handover and mistake reports go through specific API calls that change only the allowed columns.
- Timestamps are set by database triggers to server time. Whatever the phone sends is overwritten.
- PINs and the admin password are stored as bcrypt hashes. Five wrong PINs lock a phone for 10 minutes.
