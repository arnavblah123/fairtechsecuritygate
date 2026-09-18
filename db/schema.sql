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
    new.out_loaded := null;
    new.out_loaded_photo_path := null;
  else
    new.at := now();
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
