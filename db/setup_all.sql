-- Fairtech Gate: complete setup. Paste everything into the Neon SQL editor and Run. Safe to re-run.

-- Fairtech Gate Register: database schema (Neon / any Postgres 15+)
-- Paste into the Neon SQL editor and run once. Safe to re-run: uses "if not exists".

-- ---------------------------------------------------------------------------
-- Reference tables (admin-managed)
-- ---------------------------------------------------------------------------
create table if not exists units (
  id text primary key,
  name text not null,
  default_language text not null default 'hi' check (default_language in ('en','hi','mr','gu')),
  shift_start time not null default '09:00',
  unit_head_name text,
  unit_head_phone text,
  report_email text,
  active boolean not null default true
);

insert into units (id, name, default_language, shift_start) values
  ('dehu',  'Dehu (Pune)',    'mr', '09:00'),
  ('savli', 'Savli (Baroda)', 'gu', '09:00')
on conflict (id) do nothing;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists guards (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  name text not null,
  pin_hash text,
  language text check (language in ('en','hi','mr','gu')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists devices (
  id uuid primary key,
  unit_id text not null references units(id),
  label text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_guard_id uuid references guards(id),
  failed_attempts int not null default 0,
  locked_until timestamptz,
  active boolean not null default true
);

create table if not exists contractors (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  name text not null,
  active boolean not null default true
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  name text not null,
  phone text,
  active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists labourers (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  name text not null,
  contractor_id uuid references contractors(id),
  photo_path text,
  status text not null default 'approved' check (status in ('approved','pending','rejected','inactive')),
  created_by_guard_id uuid references guards(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists labourers_unit_status on labourers(unit_id, status);

create table if not exists emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  label text not null,
  phone text not null,
  sort_order int not null default 0
);

create table if not exists blacklist (
  id uuid primary key default gen_random_uuid(),
  unit_id text references units(id),            -- null = both units
  kind text not null check (kind in ('person','plate')),
  labourer_id uuid references labourers(id),
  name text,
  plate text,                                     -- normalised: upper, no spaces
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists blacklist_plate on blacklist(plate) where active;

-- ---------------------------------------------------------------------------
-- Register tables (guard-created, insert only)
-- ids are generated on the phone so offline entries are idempotent.
-- ---------------------------------------------------------------------------
create table if not exists labour_movements (
  id uuid primary key,
  unit_id text not null references units(id),
  labourer_id uuid not null references labourers(id),
  direction text not null check (direction in ('in','out')),
  at timestamptz not null default now(),
  device_at timestamptz,
  offline boolean not null default false,
  guard_id uuid references guards(id),
  device_id uuid,
  carrying_photo_path text,
  voided_at timestamptz,
  void_reason text,
  voided_by uuid
);
create index if not exists labour_movements_unit_at on labour_movements(unit_id, at desc);
create index if not exists labour_movements_labourer_at on labour_movements(labourer_id, at desc);

create table if not exists visitors (
  id uuid primary key,
  unit_id text not null references units(id),
  name text not null,
  company text,
  purpose text not null check (purpose in ('client','supplier','transporter','government','interview','other')),
  meeting_staff_id uuid references staff(id),
  meeting_name text,
  persons int not null default 1 check (persons between 1 and 50),
  id_type text not null default 'none' check (id_type in ('aadhaar','dl','company_id','none')),
  photo_path text,
  in_at timestamptz not null default now(),
  in_guard_id uuid references guards(id),
  out_at timestamptz,
  out_guard_id uuid references guards(id),
  device_at timestamptz,
  offline boolean not null default false,
  device_id uuid,
  voided_at timestamptz,
  void_reason text,
  voided_by uuid
);
create index if not exists visitors_unit_in on visitors(unit_id, in_at desc);
create index if not exists visitors_inside on visitors(unit_id) where out_at is null and voided_at is null;

create table if not exists vehicles (
  id uuid primary key,
  unit_id text not null references units(id),
  plate text not null,
  vehicle_type text not null check (vehicle_type in ('truck','tempo','trailer','car','bike','crane_hydra')),
  purpose text not null check (purpose in ('material_in','material_out','scrap_out','empty','visitor')),
  driver_name text,
  plate_photo_path text,
  challan_photo_path text,
  loaded_photo_path text,
  gatepass_photo_path text,
  in_at timestamptz not null default now(),
  in_guard_id uuid references guards(id),
  out_at timestamptz,
  out_guard_id uuid references guards(id),
  out_loaded boolean,
  out_loaded_photo_path text,
  device_at timestamptz,
  offline boolean not null default false,
  device_id uuid,
  voided_at timestamptz,
  void_reason text,
  voided_by uuid,
  constraint vehicles_material_in_photo check (purpose <> 'material_in' or challan_photo_path is not null),
  constraint vehicles_material_out_photos check (
    purpose not in ('material_out','scrap_out') or (loaded_photo_path is not null and gatepass_photo_path is not null)
  )
);
create index if not exists vehicles_unit_in on vehicles(unit_id, in_at desc);
create index if not exists vehicles_inside on vehicles(unit_id) where out_at is null and voided_at is null;

create table if not exists handovers (
  id uuid primary key,
  unit_id text not null references units(id),
  from_guard_id uuid references guards(id),
  to_guard_id uuid references guards(id),
  at timestamptz not null default now(),
  device_at timestamptz,
  labour_inside int not null default 0,
  visitors_inside int not null default 0,
  vehicles_inside int not null default 0
);

create table if not exists incidents (
  id uuid primary key,
  unit_id text not null references units(id),
  guard_id uuid references guards(id),
  type text not null check (type in ('theft','injury','fight','fire','other')),
  note text,
  photo_path text,
  at timestamptz not null default now(),
  device_at timestamptz,
  offline boolean not null default false,
  notified_at timestamptz,
  notify_error text
);

create table if not exists mistake_reports (
  id uuid primary key,
  unit_id text not null references units(id),
  register text not null check (register in ('labour','visitor','vehicle')),
  entry_id uuid not null,
  reason text,
  guard_id uuid references guards(id),
  at timestamptz not null default now(),
  device_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);

create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  report_date date not null,
  sent_at timestamptz,
  error text,
  unique (unit_id, report_date)
);

-- ---------------------------------------------------------------------------
-- Server-side timestamps. Whatever the phone sends is overwritten.
-- offline = the phone tapped more than 2 minutes before the server received it.
-- ---------------------------------------------------------------------------
create or replace function stamp_entry() returns trigger
language plpgsql as $$
begin
  if tg_table_name in ('visitors','vehicles') then
    new.in_at := now();
    new.out_at := null;
    new.out_guard_id := null;
  else
    new.at := now();
  end if;
  if tg_table_name = 'vehicles' then
    new.out_loaded := null;
    new.out_loaded_photo_path := null;
  end if;
  if tg_table_name not in ('handovers','mistake_reports') then
    new.offline := coalesce(new.device_at, now()) < now() - interval '2 minutes';
  end if;
  return new;
end $$;

drop trigger if exists stamp_labour_movements on labour_movements;
drop trigger if exists stamp_visitors on visitors;
drop trigger if exists stamp_vehicles on vehicles;
drop trigger if exists stamp_handovers on handovers;
drop trigger if exists stamp_incidents on incidents;
drop trigger if exists stamp_mistake_reports on mistake_reports;
create trigger stamp_labour_movements before insert on labour_movements for each row execute function stamp_entry();
create trigger stamp_visitors         before insert on visitors         for each row execute function stamp_entry();
create trigger stamp_vehicles         before insert on vehicles         for each row execute function stamp_entry();
create trigger stamp_handovers        before insert on handovers        for each row execute function stamp_entry();
create trigger stamp_incidents        before insert on incidents        for each row execute function stamp_entry();
create trigger stamp_mistake_reports  before insert on mistake_reports  for each row execute function stamp_entry();

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists touch_labourers on labourers;
create trigger touch_labourers before update on labourers for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Views: who is inside now
-- ---------------------------------------------------------------------------
create or replace view labour_inside as
  select distinct on (m.labourer_id)
    m.id, m.labourer_id, m.unit_id, m.at, m.direction, m.device_at, m.guard_id, m.carrying_photo_path,
    l.name, l.photo_path, l.contractor_id
  from labour_movements m
  join labourers l on l.id = m.labourer_id
  where m.voided_at is null
  order by m.labourer_id, m.at desc;
-- callers filter `where direction = 'in'`

create or replace view inside_counts as
  select u.id as unit_id,
    (select count(*) from labour_inside li where li.unit_id = u.id and li.direction = 'in')::int as labour,
    (select coalesce(sum(persons),0) from visitors v where v.unit_id = u.id and v.out_at is null and v.voided_at is null)::int as visitors,
    (select count(*) from vehicles v where v.unit_id = u.id and v.out_at is null and v.voided_at is null)::int as vehicles
  from units u;

-- ---------------------------------------------------------------------------
-- Companies: vendors, transporters, service/maintenance firms. Used to pick a
-- company for visitors and vehicles instead of typing. unit_id null = both units.
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  unit_id text references units(id),
  name text not null,
  category text not null default 'other' check (category in ('raw_material','consumables','labour','repair','transport','rent','other')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists companies_name_key on companies (lower(name));
create unique index if not exists contractors_unit_name_key on contractors (unit_id, lower(name));
create unique index if not exists staff_unit_name_key on staff (unit_id, lower(name));

-- ---------------------------------------------------------------------------
-- Live link to the production app: labourers mirrored from its Employee table.
-- ---------------------------------------------------------------------------
alter table labourers add column if not exists external_code text;
alter table labourers add column if not exists skill text;
create unique index if not exists labourers_external_code_key on labourers (external_code);
create table if not exists settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Names in Indian scripts: name_hi is Devanagari (Hindi / Marathi); Gujarati is
-- derived from it on the phone. Filled automatically by the API, editable in Admin.
-- ---------------------------------------------------------------------------
alter table labourers add column if not exists name_hi text;

-- Seed from the fairtechproduction repo (prisma/import/employees.json, the unit muster registers).
-- Paste into the Neon SQL editor after schema.sql. Safe to re-run: names already present in the unit are skipped.
-- Dehu Unit-2 -> dehu, Savli Unit-3 -> savli.
-- Chinchwad Unit-1 has no gate in this app, so its people are added to Dehu as INACTIVE;
-- reactivate anyone who uses the Dehu gate under Admin -> Labourers -> Inactive.

insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Atmaram D. Mahajan', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Atmaram D. Mahajan')); -- U1-01 Manager
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Jagdish Kalaskar', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Jagdish Kalaskar')); -- U1-02 Purchase Mgr
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Rajguru Hrushikesh', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Rajguru Hrushikesh')); -- U1-03 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Hari Pillay', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Hari Pillay')); -- U1-04 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Nirmal Singh', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Nirmal Singh')); -- U1-05 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Arjun Rajbhar', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Arjun Rajbhar')); -- U1-06 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Santosh Gore', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Santosh Gore')); -- U1-07 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Mohammad Salmani', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Mohammad Salmani')); -- U1-08 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Golu', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Golu')); -- U1-09 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Dyaneshwar', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Dyaneshwar')); -- U1-10 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Sunil Yadav', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Sunil Yadav')); -- U1-11 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Swapnil Mehtar', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Swapnil Mehtar')); -- U1-12 Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Dipak Shankar Surve', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Dipak Shankar Surve')); -- U1-13 Store Keeper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Rakendra', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Rakendra')); -- U1-14 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Chandresh Paswan(Shyam)', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Chandresh Paswan(Shyam)')); -- U1-15 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Ghanshyam', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Ghanshyam')); -- U1-16 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Aditya Kushwaha', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Aditya Kushwaha')); -- U1-17 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Vinod Shukla', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Vinod Shukla')); -- U1-18 Engineer
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Vijay Naik', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Vijay Naik')); -- U1-19 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Avnish Vishvakarma', 'inactive' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Avnish Vishvakarma')); -- U1-20 Semi Skilled
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Manish Mer', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Manish Mer')); -- U3-02 Engineer
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Santosh', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Santosh')); -- U3-03 Fitter
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Mukesh', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Mukesh')); -- U3-31 Fitter
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Ajay Paswan', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Ajay Paswan')); -- U3-05 Fitter
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Ranjit Kumar', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Ranjit Kumar')); -- U3-06 Fitter
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Natvarbhai', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Natvarbhai')); -- U3-08 Operator
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Jamshed', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Jamshed')); -- U3-09 Operator
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Dharmendra Kaka', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Dharmendra Kaka')); -- U3-10 Operator
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Dharmveer', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Dharmveer')); -- U3-11 Welder
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Abu Ansari', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Abu Ansari')); -- U3-50 Welder
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Mandeep', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Mandeep')); -- U3-13 Welder
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Vijay Kumar', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Vijay Kumar')); -- U3-14 Gas Cutter
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Ranjit Parmar', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Ranjit Parmar')); -- U3-15 Expansion
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Jivan Parmar', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Jivan Parmar')); -- U3-16 Grinder Man
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Mukesh Kumar', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Mukesh Kumar')); -- U3-24 Gas Cutter
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Suren', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Suren')); -- U3-25 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Prem', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Prem')); -- U3-26 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Golu Kumar', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Golu Kumar')); -- U3-27 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Chandra Sihn', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Chandra Sihn')); -- U3-28 Grinder Man
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Ashokbhai Parmar', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Ashokbhai Parmar')); -- U3-34 Operator
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Karan', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Karan')); -- U3-36 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Avinash', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Avinash')); -- U3-37 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Sohail', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Sohail')); -- U3-51 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Chandan', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Chandan')); -- U3-52 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Sujeet', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Sujeet')); -- U3-53 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Ajay Kumar', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Ajay Kumar')); -- U3-54 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Anuj', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Anuj')); -- U3-55 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Rakendra', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Rakendra')); -- U3-56 Welder
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Manjulal Harijan', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Manjulal Harijan')); -- U3-57 Sweeper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'savli', 'Chiman Kaka', 'approved' where not exists (select 1 from labourers where unit_id = 'savli' and lower(name) = lower('Chiman Kaka')); -- U3-58 Security
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Kanhiya', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Kanhiya')); -- U2-01 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Aditya', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Aditya')); -- U2-02 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Harindra Paswan', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Harindra Paswan')); -- U2-03 Welder
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Md Juman', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Md Juman')); -- U2-04 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Md Raju', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Md Raju')); -- U2-05 Welder
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Suraj Yadav', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Suraj Yadav')); -- U2-06 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Rakesh Paswan', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Rakesh Paswan')); -- U2-07 Cutter
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Arvind Yadav', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Arvind Yadav')); -- U2-08 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Sagar', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Sagar')); -- U2-09 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Mithun', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Mithun')); -- U2-10 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Virendar', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Virendar')); -- U2-11 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Dilip Kumar', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Dilip Kumar')); -- U2-12 Welder
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Rajan', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Rajan')); -- U2-13 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Samir', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Samir')); -- U2-14 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Monu', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Monu')); -- U2-15 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Bolu', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Bolu')); -- U2-16 Welder
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Abhay', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Abhay')); -- U2-17 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Vinay', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Vinay')); -- U2-18 Welder
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Dilip Patil', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Dilip Patil')); -- U2-19 Helper
insert into labourers (id, unit_id, name, status) select gen_random_uuid(), 'dehu', 'Suraj K', 'approved' where not exists (select 1 from labourers where unit_id = 'dehu' and lower(name) = lower('Suraj K')); -- U2-20 Helper

-- Office staff for the visitor 'whom to meet' list.
insert into staff (unit_id, name) values
  ('dehu', 'Atmaram D. Mahajan'),
  ('dehu', 'Jagdish Kalaskar'),
  ('dehu', 'Vinod Shukla'),
  ('dehu', 'Dipak Shankar Surve'),
  ('savli', 'Manish Mer')
on conflict (unit_id, lower(name)) do nothing;

-- Seed from Google Drive (Vendor Exposure Apr-Jun 2026, LABOUR CONTRACTOR LIST.xlsx).
-- Paste into the Neon SQL editor after schema.sql. Safe to re-run: existing names are skipped.

insert into companies (unit_id, name, category) values
  (null, 'Mittal Engineering Works', 'raw_material'),
  (null, 'Hi-Tech Steel & Tubes', 'raw_material'),
  (null, 'ACS Enterprises', 'raw_material'),
  (null, 'S Mahipal Steel', 'raw_material'),
  (null, 'India Steel', 'raw_material'),
  (null, 'N.S. Enterprises', 'raw_material'),
  (null, 'Ratnabhumi Steeltech Pvt. Ltd.', 'raw_material'),
  (null, 'Chaudhary Electric & Hardware Store', 'consumables'),
  (null, 'Mastertech Business Solutions Pvt Ltd', 'raw_material'),
  (null, 'Tushar Steel Traders', 'raw_material'),
  (null, 'MMST Enterprises', 'labour'),
  (null, 'Trimurti Engimetal and Steel Works Pvt Ltd', 'raw_material'),
  (null, 'Adira Enterprises', 'rent'),
  (null, 'Abhilash Tukaram Kalokhe', 'rent'),
  (null, 'Prakash Enterprises', 'consumables'),
  (null, 'Shree Om Enterprises', 'consumables'),
  (null, 'Raj Electrical Works', 'repair'),
  (null, 'Shree Krishna Steel', 'raw_material'),
  (null, 'Sunrise Traders', 'consumables'),
  (null, 'Mittal''s Colour World', 'consumables'),
  (null, 'MSEDCL (Mahavitaran)', 'other'),
  (null, 'Shrijee Sales Corporation', 'raw_material'),
  (null, 'Jagadguru Enterprises', 'consumables'),
  (null, 'Prince Enterprises', 'other'),
  (null, 'Apex Technologies', 'consumables'),
  (null, 'SS Enterprises', 'other'),
  (null, 'Neumet Engineers India Pvt Ltd', 'raw_material'),
  (null, 'Sunil Transport', 'transport'),
  (null, 'Urmi Oxygen Co.', 'consumables'),
  (null, 'Kishor HP Gas', 'consumables'),
  (null, 'MM Crane Services', 'transport'),
  (null, 'Delta Colour Chem Ind', 'consumables'),
  (null, 'Vipul J Solanki', 'other'),
  (null, 'Shri Swami Samarth Crane Services', 'transport'),
  (null, 'SaRSA Industries', 'labour'),
  (null, 'Noble Fastners', 'consumables'),
  (null, 'SP Auto Stamp LLP', 'labour'),
  (null, 'Miracle Enterprises', 'labour'),
  (null, 'S S Computers', 'other'),
  (null, 'Techno Tools', 'consumables'),
  (null, 'Pune NDT Services', 'other'),
  (null, 'Shiv Engineering & Dishing Works', 'other'),
  (null, 'Scan Laser', 'labour'),
  (null, 'A B Engineering & Fabrication', 'labour'),
  (null, 'Shah Marketing', 'raw_material'),
  (null, 'Vishal Management Services', 'other'),
  (null, 'AQ Tech Solutions', 'other'),
  (null, 'Ansh Enterprises', 'raw_material'),
  (null, 'Jay Bhole Water Supplier', 'other'),
  (null, 'Sairaj Welding Sales & Service', 'repair'),
  (null, 'Keval Incorporation', 'consumables'),
  ('savli', 'Baroda Steel & Metal Corporation', 'raw_material'),
  (null, 'Jay Ambe Enterprise', 'consumables'),
  (null, 'BRC Logistics', 'transport'),
  (null, 'Shree Balaji Tempo Service', 'transport'),
  (null, 'Kamla Hardware & Electricals', 'consumables'),
  (null, 'Shree Veena Enterprises', 'other'),
  (null, 'P.D. Combustion Air', 'consumables'),
  (null, 'Magtech Fasteners', 'consumables'),
  (null, 'Technomech Solution', 'repair'),
  (null, 'S. R. Industries', 'other'),
  (null, 'Shiv NDT Services', 'other'),
  (null, 'Electronics Devices Worldwide Pvt Ltd', 'consumables'),
  (null, 'Shree Agrasen Gases', 'consumables'),
  (null, 'Vaishnavi Enterprises', 'labour'),
  (null, 'Nirmal Engineers', 'labour'),
  ('savli', 'Vadodara Packaging & Safety Pvt. Ltd.', 'consumables')
on conflict (lower(name)) do nothing;

-- Labour contractors. The sheet has no unit column, so they go to Dehu; change the unit in Admin → Contractors if needed.
insert into contractors (unit_id, name) values
  ('dehu', 'Indal'),
  ('dehu', 'Walje'),
  ('dehu', 'Ranjit Sutar'),
  ('dehu', 'Gupta'),
  ('dehu', 'Kailash'),
  ('dehu', 'Arjun'),
  ('dehu', 'Vijay'),
  ('dehu', 'Tiwari'),
  ('dehu', 'Morales'),
  ('dehu', 'Verma'),
  ('dehu', 'Akhilesh'),
  ('dehu', 'Pandit')
on conflict (unit_id, lower(name)) do nothing;
