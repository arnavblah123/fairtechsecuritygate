# Fairtech Gate Register

Gate register PWA for Fairtech Engineers: Dehu (Pune) and Savli (Baroda).
React + Vite + Tailwind on Vercel, Supabase (Postgres, Auth, Storage, Edge Functions).

Design and data model: [docs/DESIGN.md](docs/DESIGN.md).

## Setup (one time)

### 1. Supabase project
1. Create a **new, separate** Supabase project (region: Mumbai).
2. SQL editor → paste and run `supabase/migrations/0001_init.sql`.
3. Authentication → Providers → Email: keep enabled. Turn **off** "Confirm email" (guards' internal users are created by the Edge Function and you will create your own admin login by hand).
4. Authentication → Users → **Add user**: your email + a strong password. Copy the user's UUID.
5. SQL editor:
   ```sql
   insert into admins (user_id, email) values ('<your-user-uuid>', 'you@example.com');
   ```
6. Deploy the login function (needs the Supabase CLI, `npm i -g supabase`, then `supabase login`):
   ```bash
   supabase link --project-ref <project-ref>
   supabase functions deploy guard-login --no-verify-jwt
   ```
   The function uses the project's built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; no extra secrets needed.

### 2. Vercel
1. Import this repo. Framework: Vite. Build command `npm run build`, output `dist`.
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Project Settings → API in Supabase).
3. Deploy. The app is served over HTTPS, which the camera and offline mode require.

### 3. First data (admin)
Open `https://<your-app>/admin`, sign in, then:
1. **Contractors**: add the contractors for each unit.
2. **Labourers**: add name, contractor and photo for each unit.
3. **Guards & PINs**: add each guard with a 4-digit PIN (unique within the unit).

### 4. Guard phone
1. Open the app URL in Chrome → menu → **Add to Home screen**.
2. Open it from the home screen. First time: pick the factory, then the guard enters the PIN.
   The phone is now locked to that unit (visible under Admin → Devices).

## Development
```bash
cp .env.example .env   # fill in the Supabase URL and anon key
npm install
npm run dev
```

## Layout
- `src/guard/` guard screens (all text from `src/locales/*.json`)
- `src/admin/` admin pages (English)
- `src/lib/` Supabase client, local database (Dexie), offline sync queue, photos, i18n
- `supabase/migrations/` schema, RLS, triggers, views, RPCs
- `supabase/functions/guard-login/` PIN login Edge Function

## Translations
Edit `src/locales/hi.json`, `mr.json`, `gu.json` (and `en.json`). Keys must match `en.json`; `{n}` style placeholders are filled by the app.

## How offline works
Every tap is saved to the phone's IndexedDB first (rows and photos), then a queue uploads photos and rows in order when internet is available. The home screen shows "N to send". Entries are never dropped: a failed item stays in the queue and can be retried from the sync screen. Row ids are generated on the phone, so a retry can never create a duplicate.
