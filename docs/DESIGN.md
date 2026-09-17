# Fairtech Gate Register — Design (Step 1)

Standalone app for the gate at two Fairtech Engineers units: **Dehu (Pune)** and **Savli (Baroda)**.
Stack (all free plans, no card): React (Vite, TypeScript, Tailwind) PWA on Vercel, one Vercel serverless function (Hono) as the API, Neon Postgres for data, Vercel Blob (private store) for photos, Vercel Cron for the daily jobs.

Timezone everywhere: Asia/Kolkata.

---

## 1. Data model (Neon Postgres)

Conventions
- Every guard-facing table has `unit_id`. The API filters every guard request by the unit inside the login token.
- Every guard-created row's `id` is generated on the phone, so an offline entry synced twice is stored once.
- Not an attendance system. Labour IN/OUT is a gate log only; labourers may stay inside for days.
- Timestamps (`in_at`, `out_at`, `at`) are set by database triggers to `now()`. Anything the phone sends for these columns is overwritten.
- `device_at` = phone clock at the moment of tapping. Stored for information only, shown in admin when `offline = true`.
- Photo columns hold a storage path, never a URL. URLs are signed on demand (1 hour).

### Reference tables (admin-managed)

| Table | Columns |
|---|---|
| `units` | `id text PK` (`dehu`, `savli`), `name`, `default_language` (`mr` / `gu`), `shift_start time`, `unit_head_name`, `unit_head_phone`, `report_email`, `active` |
| `guards` | `id uuid`, `unit_id`, `name`, `pin_hash` (bcrypt, 4 digits), `language` (nullable, overrides unit default), `active` |
| `devices` | `id uuid` (generated on the phone, stored in localStorage), `unit_id`, `label`, `registered_at`, `last_seen_at`, `active` |
| `contractors` | `id`, `unit_id`, `name`, `active` |
| `staff` | `id`, `unit_id`, `name`, `phone`, `active` — the "whom to meet" list |
| `labourers` | `id`, `unit_id`, `name`, `contractor_id`, `photo_path`, `status` (`approved` / `pending` / `rejected` / `inactive`), `created_by_guard_id`, `created_at` |
| `emergency_contacts` | `id`, `unit_id`, `label`, `phone`, `sort_order` |
| `blacklist` | `id`, `unit_id` (null = both units), `kind` (`person` / `plate`), `labourer_id`, `name`, `plate` (normalised: uppercase, no spaces), `reason`, `active`, `created_at` |
| `admin_users` | `id`, `email`, `password_hash` (bcrypt). The first visit to /admin creates the first admin. |

### Register tables (guard-created)

| Table | Columns |
|---|---|
| `labour_movements` | `id`, `unit_id`, `labourer_id`, `direction` (`in` / `out`), `at` (server), `device_at`, `offline bool`, `guard_id`, `device_id`, `carrying_photo_path` (OUT only, optional), `voided_at`, `void_reason` |
| `visitors` | `id`, `unit_id`, `name`, `company`, `purpose` (`client` / `supplier` / `transporter` / `government` / `interview` / `other`), `meeting_staff_id`, `persons int` (default 1), `id_type` (`aadhaar` / `dl` / `company_id` / `none`), `photo_path`, `in_at`, `in_guard_id`, `out_at`, `out_guard_id`, `device_at`, `offline`, `device_id`, `voided_at`, `void_reason` |
| `vehicles` | `id`, `unit_id`, `plate` (normalised), `vehicle_type` (`truck` / `tempo` / `trailer` / `car` / `bike` / `crane_hydra`), `purpose` (`material_in` / `material_out` / `scrap_out` / `empty` / `visitor`), `driver_name`, `plate_photo_path`, `challan_photo_path` (Material In), `loaded_photo_path` + `gatepass_photo_path` (Material Out / Scrap Out), `in_at`, `in_guard_id`, `out_at`, `out_guard_id`, `out_loaded bool`, `out_loaded_photo_path`, `device_at`, `offline`, `device_id`, `voided_at`, `void_reason` |
| `handovers` | `id`, `unit_id`, `from_guard_id`, `to_guard_id`, `at`, `labour_inside`, `visitors_inside`, `vehicles_inside` |
| `incidents` | `id`, `unit_id`, `guard_id`, `type` (`theft` / `injury` / `fight` / `fire` / `other`), `note`, `photo_path`, `at`, `notified_at`, `notify_error` |
| `mistake_reports` | `id`, `unit_id`, `register` (`labour` / `visitor` / `vehicle`), `entry_id`, `reason`, `guard_id`, `at`, `resolved_at`, `resolved_by`, `resolution_note` |
| `daily_reports` | `id`, `unit_id`, `report_date`, `sent_at`, `error` — one row per unit per day so a failed send is visible |

Database rules enforced by constraints/triggers (not just the UI)
- `vehicles`: `purpose = material_in` requires `challan_photo_path`; `material_out` / `scrap_out` require both `loaded_photo_path` and `gatepass_photo_path`.
- `labour_movements`: the app offers the expected next direction (IN or OUT) big, with a small link for the other one. Not enforced in the database because labour stays inside for days and the register may start mid-way.
- A visitor / vehicle can be marked OUT only once; OUT sets `out_at = now()`.
- Guards can INSERT, never UPDATE or DELETE. The API whitelists the columns a guard may send and forces `unit_id`, `guard_id` and `device_id` from the token. Marking OUT, handover, and the carrying photo go through specific API calls that only change the allowed columns.
- "Currently inside" = rows with `out_at IS NULL` (visitors, vehicles) or the labourer's last non-voided movement is `in`.

### Storage
- One private Vercel Blob store (1 GB free). Path: `{unit_id}/{register}/{yyyy-mm}/{uuid}.jpg`.
- Phone compresses to about 120 KB (max side 1024 px, JPEG) before upload, so 1 GB holds roughly 8,000 photos.
- Photos are uploaded and served through the API, which checks the unit prefix against the token. No public URLs.
- Nightly job deletes entry photos older than 90 days (visitor, vehicle, carrying, incident) and blanks the photo columns; if the store is above 900 MB it also removes the oldest entry photos first. The rows and all their data are kept forever. Labourer profile photos are master data and are kept.

### Auth and unit isolation
- **Guard**: `POST /api/guard/login` with `device_id`, `unit_id` (first login only) and `pin`. The API checks the PIN against the active guards of that unit (bcrypt), locks the phone to the unit on first login, and returns a 30-day signed token (JWT) with `role = guard`, `unit_id`, `guard_id`, `device_id`. The token is refreshed silently when it is within 7 days of expiry; offline the app keeps working from the local queue.
- Every guard route reads the unit from the token, never from the request. Changing the URL or the request body cannot cross units.
- Device to unit lock lives in the `devices` table. Admin can unlock / reassign a device. Five wrong PINs lock a phone for 10 minutes.
- **Admin**: email + password (bcrypt) → 7-day token with `role = admin`.

### Scheduled jobs (Vercel Cron, 2 daily jobs on the free plan)
- 20:00 IST daily: `daily-report` builds one email per unit and sends it (see section 4).
- 02:00 IST daily: `photo-cleanup` (90-day rule).
- Incident alert is sent by the API at the moment the incident row arrives.

---

## 2. Guard screens

All labels come from `src/locales/{en,hi,mr,gu}.json`. Minimum tap target 56 px, dark text on white, large type.

| # | Screen | What is on it |
|---|---|---|
| 1 | **Unit select** (first login on this phone only) | Two big buttons: Dehu, Savli. Language toggle. |
| 2 | **Login** | Guard name buttons? No — just a 4-digit PIN pad (big keys). Language toggle (EN / हिंदी / मराठी / ગુજરાતી). Pending-sync count if any. |
| 3 | **Home** | Top: *Inside now: N people, N vehicles*, *N pending* sync badge, unit name, guard name. Four full-width buttons with icons: LABOUR, VISITOR, VEHICLE, EMERGENCY. Below: today's entries, newest first, with thumbnail, name/plate, IN/OUT, time. Tap an entry → Entry detail. ⋯ menu: Handover, Incident, Language, Logout. |
| 4 | **Labour grid** | Search box (name). Grid of photo + name for approved and today's pending labourers of this unit. NEW PERSON button at the bottom (sticky). |
| 5 | **Labour IN / OUT** | Big photo + name + contractor. One big button: IN or OUT (whichever is next). On OUT, after saving: optional "Carrying something?" → camera → save. Blacklisted person → screen 16 instead. |
| 6 | **New person** | Camera → name → contractor (buttons) → IN. Person appears in the grid for today, flagged `pending` for admin. |
| 7 | **Visitor IN** (one step per screen, big Next button) | Camera → name → company (optional, skip button) → purpose (6 buttons) → whom to meet (staff buttons) → ID type (4 buttons) → persons (1, with + / −) → IN. |
| 8 | **Visitor OUT** | Photo cards of visitors currently inside with time inside → tap → confirm OUT. |
| 9 | **Vehicle IN** | Camera (number plate) → plate (uppercase, big keyboard; blacklist check on this step) → type (6 buttons) → purpose (5 buttons) → driver name (optional) → extra photos required by purpose (challan; or loaded vehicle + gate pass) → IN. Cannot proceed without the required photos. |
| 10 | **Vehicle OUT** | Cards of vehicles inside: plate photo, plate, type, purpose, time inside (red after 4 h). Tap → if entered Empty: "Loaded?" Yes/No; Yes requires a photo → OUT. |
| 11 | **Emergency** (works fully offline) | Count at top. Emergency numbers as big call buttons (unit head, fire, hospital, admin). Then everyone inside with photos: labour, visitors (with persons count), vehicle drivers. |
| 12 | **Handover** | Shows counts inside (labour / visitors / vehicles). Confirm → next guard's PIN pad → logged, next guard is now logged in. |
| 13 | **Incident** | Camera → type (5 buttons) → short note (optional) → Send. Alert goes out on sync. |
| 14 | **Entry detail** | Full photo(s), all fields, time. Button: Report mistake → reason (a few preset buttons + optional text) → sent. Entry shows a "mistake reported" tag; once admin voids it, it shows struck-through. |
| 15 | **Camera** (shared) | Full-screen capture with Retake / Use. Falls back to the phone's native camera picker if the in-app camera is not allowed. |
| 16 | **Blacklist warning** | Full-screen red: "Do not allow — call {unit head}" with a Call button. Only way out is Back; nothing is saved. |
| 17 | **Sync status** (from the pending badge) | List of queued entries and photos, retry button, last sync time. Not needed day-to-day. |

Offline behaviour
- Everything the guard taps is written to IndexedDB first (rows + photo blobs), then a background sync uploads photos, then rows, in order. Home shows *N pending*.
- Labourer list, staff list, contractors, emergency contacts, blacklist and "currently inside" are cached locally so all guard screens open offline.
- The app is a PWA (installable to home screen, opens without browser chrome).

---

## 3. Admin pages (English only, plain)

| Page | Purpose |
|---|---|
| Login | Email + password |
| Live | Both units: inside now, today's entries, pending sync devices, last handover |
| Labourers | List / add / edit / deactivate, photo upload, contractor. **Pending approvals** tab for NEW PERSON entries: approve, merge into an existing labourer, or reject. |
| Contractors, Staff | Simple lists per unit |
| Guards & PINs | Add guard, set/reset 4-digit PIN, language, active |
| Devices | See phones locked to each unit, unlock / rename / disable |
| Emergency contacts | Per unit |
| Blacklist | Add person (pick labourer or type name) or plate, reason, unit or both |
| Settings | Per unit: shift start time, unit head name/phone, report email; global: incident alert recipients |
| Mistake reports | Open / resolved; open one → see entry → Void entry (keeps it struck-through) and/or add a corrected entry, add note |
| Incidents | List with photos, delivery status |
| Registers | Labour / Visitor / Vehicle / Handover tables with date range + unit filter, photo previews, **Download Excel** |
| Daily reports | Per unit per day: sent / failed, resend button |

---

## 4. Notifications

- **Daily report** (20:00 IST, per unit, email): labour IN/OUT counts, late entries (first IN after shift start), visitors, vehicles with purpose and photo links (signed, valid 7 days), still inside, incidents, mistake reports, handover done or not.
- **Incident alert**: email immediately (default). WhatsApp/SMS is possible via Twilio if you want it; it needs a paid account and WhatsApp template approval, so it is left as an option, not the default.
- Email provider: Resend (free tier is enough for 2 emails a day + incidents). You will need to give me a Resend API key and a verified sender domain or use their test sender.

---

## 5. Decisions (confirmed)

1. **Offline timestamp rule.** Server time is the official `at`; the phone's time is kept in `device_at` and the row is marked `offline` when they differ by more than 2 minutes. Both are shown in admin and reports for offline rows.
2. **Incident alert**: email only.
3. **Guard login**: PIN only, 4-digit PINs unique within a unit, set by admin.
4. **Photos** are kept 3 months (90 days), then deleted. Data is kept forever.
5. **Not an attendance app.** Late-entry list in the daily report stays simple: labour IN after shift start.

---

## 6. Build plan

| Step | Delivers |
|---|---|
| 2 | Neon schema, API (login, entries, photos, admin); PWA shell; unit select, login, home, Labour (grid, IN/OUT, new person, carrying photo); offline queue + sync; 4 locale files; admin: login, labourers, contractors, guards, devices |
| 3 | Visitor, Vehicle, Emergency; admin: staff, emergency contacts |
| 4 | Handover, incident + alert, blacklist + warning, mistake reports + void, daily report email, Excel exports, photo cleanup job |
