-- Fairtech Gate Register: initial schema
-- Run in the Supabase SQL editor of a fresh project, or with `supabase db push`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS
-- ---------------------------------------------------------------------------
create or replace function app_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function app_unit() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'unit_id', '')
$$;

create or replace function app_guard() returns uuid
language sql stable as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'guard_id', '')::uuid
$$;

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

create or replace function is_guard() returns boolean
language sql stable as $$
  select app_role() = 'guard' and app_unit() <> ''
$$;

create policy admins_self on admins for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------
create table units (
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
  ('savli', 'Savli (Baroda)', 'gu', '09:00');

create table guards (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  name text not null,
  pin_hash text,
  language text check (language in ('en','hi','mr','gu')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Service-role only: links a guard to a Supabase Auth user. No policies on purpose.
create table guard_auth (
  guard_id uuid primary key references guards(id) on delete cascade,
  auth_user_id uuid not null,
  secret text not null
);
alter table guard_auth enable row level security;

create table devices (
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

create table contractors (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  name text not null,
  active boolean not null default true
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  name text not null,
  phone text,
  active boolean not null default true,
  sort_order int not null default 0
);

create table labourers (
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
create index labourers_unit_status on labourers(unit_id, status);

create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id),
  label text not null,
  phone text not null,
  sort_order int not null default 0
);

create table blacklist (
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
create index blacklist_plate on blacklist(plate) where active;

-- ---------------------------------------------------------------------------
-- Register tables (guard-created, insert only)
-- ids are generated on the phone so offline entries are idempotent.
-- ---------------------------------------------------------------------------
create table labour_movements (
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
create index labour_movements_unit_at on labour_movements(unit_id, at desc);
create index labour_movements_labourer_at on labour_movements(labourer_id, at desc);

create table visitors (
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
create index visitors_unit_in on visitors(unit_id, in_at desc);
create index visitors_inside on visitors(unit_id) where out_at is null and voided_at is null;

create table vehicles (
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
create index vehicles_unit_in on vehicles(unit_id, in_at desc);
create index vehicles_inside on vehicles(unit_id) where out_at is null and voided_at is null;

create table handovers (
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

create table incidents (
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

create table mistake_reports (
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

create table daily_reports (
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
  if tg_table_name <> 'handovers' and tg_table_name <> 'mistake_reports' then
    new.offline := coalesce(new.device_at, now()) < now() - interval '2 minutes';
  end if;
  -- guards can never void, notify or resolve
  if not is_admin() then
    if tg_table_name in ('labour_movements','visitors','vehicles') then
      new.voided_at := null; new.void_reason := null; new.voided_by := null;
    end if;
    if tg_table_name = 'incidents' then new.notified_at := null; new.notify_error := null; end if;
    if tg_table_name = 'mistake_reports' then new.resolved_at := null; new.resolved_by := null; new.resolution_note := null; end if;
  end if;
  return new;
end $$;

create trigger stamp_labour_movements before insert on labour_movements for each row execute function stamp_entry();
create trigger stamp_visitors         before insert on visitors         for each row execute function stamp_entry();
create trigger stamp_vehicles         before insert on vehicles         for each row execute function stamp_entry();
create trigger stamp_handovers        before insert on handovers        for each row execute function stamp_entry();
create trigger stamp_incidents        before insert on incidents        for each row execute function stamp_entry();
create trigger stamp_mistake_reports  before insert on mistake_reports  for each row execute function stamp_entry();

-- Guards can only create pending labourers for their own unit.
create or replace function stamp_labourer() returns trigger
language plpgsql as $$
begin
  if is_guard() then
    new.status := 'pending';
    new.created_by_guard_id := app_guard();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger stamp_labourers before insert or update on labourers for each row execute function stamp_labourer();

-- ---------------------------------------------------------------------------
-- Views: who is inside now
-- ---------------------------------------------------------------------------
create view labour_inside with (security_invoker = true) as
  select distinct on (m.labourer_id)
    m.id, m.labourer_id, m.unit_id, m.at, m.direction, m.device_at, m.guard_id, m.carrying_photo_path,
    l.name, l.photo_path, l.contractor_id
  from labour_movements m
  join labourers l on l.id = m.labourer_id
  where m.voided_at is null
  order by m.labourer_id, m.at desc;
-- callers filter `where direction = 'in'`

create view inside_counts with (security_invoker = true) as
  select u.id as unit_id,
    (select count(*) from labour_inside li where li.unit_id = u.id and li.direction = 'in') as labour,
    (select coalesce(sum(persons),0) from visitors v where v.unit_id = u.id and v.out_at is null and v.voided_at is null) as visitors,
    (select count(*) from vehicles v where v.unit_id = u.id and v.out_at is null and v.voided_at is null) as vehicles
  from units u;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
-- Admin sets a 4-digit PIN. PINs must be unique within a unit.
create or replace function set_guard_pin(p_guard uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare v_unit text;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
  select unit_id into v_unit from guards where id = p_guard;
  if v_unit is null then raise exception 'guard not found'; end if;
  if exists (
    select 1 from guards g where g.unit_id = v_unit and g.id <> p_guard and g.active
      and g.pin_hash is not null and g.pin_hash = crypt(p_pin, g.pin_hash)
  ) then raise exception 'Another guard in this unit already has this PIN'; end if;
  update guards set pin_hash = crypt(p_pin, gen_salt('bf', 8)) where id = p_guard;
end $$;
revoke all on function set_guard_pin(uuid, text) from public, anon;
grant execute on function set_guard_pin(uuid, text) to authenticated;

-- Used by the guard-login Edge Function (service role only).
create or replace function verify_guard_pin(p_unit text, p_pin text)
returns table (id uuid, name text, language text)
language sql security definer set search_path = public as $$
  select g.id, g.name, g.language from guards g
  where g.unit_id = p_unit and g.active and g.pin_hash is not null and g.pin_hash = crypt(p_pin, g.pin_hash)
  limit 1
$$;
revoke all on function verify_guard_pin(text, text) from public, anon, authenticated;

-- Guard attaches the optional "carrying" photo to an OUT movement made in the last 30 minutes.
create or replace function attach_carrying_photo(p_movement uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_guard() or is_admin()) then raise exception 'not allowed'; end if;
  update labour_movements set carrying_photo_path = p_path
  where id = p_movement and carrying_photo_path is null and direction = 'out'
    and (is_admin() or (unit_id = app_unit() and at > now() - interval '30 minutes'));
end $$;
grant execute on function attach_carrying_photo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table units enable row level security;
alter table guards enable row level security;
alter table devices enable row level security;
alter table contractors enable row level security;
alter table staff enable row level security;
alter table labourers enable row level security;
alter table emergency_contacts enable row level security;
alter table blacklist enable row level security;
alter table labour_movements enable row level security;
alter table visitors enable row level security;
alter table vehicles enable row level security;
alter table handovers enable row level security;
alter table incidents enable row level security;
alter table mistake_reports enable row level security;
alter table daily_reports enable row level security;

-- Admin: everything
create policy admin_all on units for all using (is_admin()) with check (is_admin());
create policy admin_all on guards for all using (is_admin()) with check (is_admin());
create policy admin_all on devices for all using (is_admin()) with check (is_admin());
create policy admin_all on contractors for all using (is_admin()) with check (is_admin());
create policy admin_all on staff for all using (is_admin()) with check (is_admin());
create policy admin_all on labourers for all using (is_admin()) with check (is_admin());
create policy admin_all on emergency_contacts for all using (is_admin()) with check (is_admin());
create policy admin_all on blacklist for all using (is_admin()) with check (is_admin());
create policy admin_all on labour_movements for all using (is_admin()) with check (is_admin());
create policy admin_all on visitors for all using (is_admin()) with check (is_admin());
create policy admin_all on vehicles for all using (is_admin()) with check (is_admin());
create policy admin_all on handovers for all using (is_admin()) with check (is_admin());
create policy admin_all on incidents for all using (is_admin()) with check (is_admin());
create policy admin_all on mistake_reports for all using (is_admin()) with check (is_admin());
create policy admin_all on daily_reports for all using (is_admin()) with check (is_admin());

-- Guard: read own unit
create policy guard_read on units for select using (is_guard() and id = app_unit());
create policy guard_read on guards for select using (is_guard() and unit_id = app_unit());
create policy guard_read on contractors for select using (is_guard() and unit_id = app_unit());
create policy guard_read on staff for select using (is_guard() and unit_id = app_unit());
create policy guard_read on labourers for select using (is_guard() and unit_id = app_unit());
create policy guard_read on emergency_contacts for select using (is_guard() and unit_id = app_unit());
create policy guard_read on blacklist for select using (is_guard() and (unit_id is null or unit_id = app_unit()));
create policy guard_read on labour_movements for select using (is_guard() and unit_id = app_unit());
create policy guard_read on visitors for select using (is_guard() and unit_id = app_unit());
create policy guard_read on vehicles for select using (is_guard() and unit_id = app_unit());
create policy guard_read on handovers for select using (is_guard() and unit_id = app_unit());
create policy guard_read on incidents for select using (is_guard() and unit_id = app_unit());
create policy guard_read on mistake_reports for select using (is_guard() and unit_id = app_unit());

-- Guard: insert into own unit, as themselves. Never update or delete.
create policy guard_insert on labourers for insert with check (is_guard() and unit_id = app_unit());
create policy guard_insert on labour_movements for insert with check (is_guard() and unit_id = app_unit() and guard_id = app_guard());
create policy guard_insert on visitors for insert with check (is_guard() and unit_id = app_unit() and in_guard_id = app_guard());
create policy guard_insert on vehicles for insert with check (is_guard() and unit_id = app_unit() and in_guard_id = app_guard());
create policy guard_insert on incidents for insert with check (is_guard() and unit_id = app_unit() and guard_id = app_guard());
create policy guard_insert on mistake_reports for insert with check (is_guard() and unit_id = app_unit() and guard_id = app_guard());

-- Nobody reads pin hashes through the API (set_guard_pin / verify_guard_pin are security definer).
revoke select on guards from authenticated, anon;
grant select (id, unit_id, name, language, active, created_at) on guards to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket, paths start with the unit id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy photos_admin on storage.objects for all
  using (bucket_id = 'photos' and public.is_admin()) with check (bucket_id = 'photos' and public.is_admin());
create policy photos_guard_read on storage.objects for select
  using (bucket_id = 'photos' and public.is_guard() and split_part(name, '/', 1) = public.app_unit());
create policy photos_guard_write on storage.objects for insert
  with check (bucket_id = 'photos' and public.is_guard() and split_part(name, '/', 1) = public.app_unit());
