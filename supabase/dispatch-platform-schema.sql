-- Dispatch platform: Supabase-backed loads, carrier portal config, subscriptions.
-- Run in Supabase SQL Editor after freight-schema.sql and dispatch-roster-schema.sql.

-- ─── Carrier subscription (portal access) ─────────────────────────────────────
alter table public.profiles add column if not exists carrier_subscription_status text;
alter table public.profiles add column if not exists carrier_trial_ends_at timestamptz;
alter table public.profiles add column if not exists carrier_stripe_subscription_id text;

-- ─── Dispatch loads (replaces Google Sheet as source of truth) ────────────────
create table if not exists public.dispatch_loads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  month_tab text not null,
  sr integer not null default 1,
  booked_by text,
  rc_date text,
  truck_trailer text,
  company_name text not null,
  broker text,
  load_details text,
  pickup_date_time text,
  delivery_date_time text,
  miles numeric not null default 0,
  load_number text,
  states text,
  rc_invoice numeric not null default 0,
  dispatch_percent numeric not null default 0,
  dispatch_fee numeric not null default 0,
  invoice text,
  received numeric not null default 0,
  balance numeric not null default 0,
  notes text,
  claim text,
  status text not null default 'Unpaid',
  cpay text,
  dtp text,
  broker_agent_name text,
  email text,
  phone text,
  carrier_profile_id uuid references public.profiles (id) on delete set null,
  assigned_driver_profile_id uuid references public.profiles (id) on delete set null,
  source text not null default 'dispatcher' check (source in ('dispatcher', 'import', 'sheet'))
);

create unique index if not exists dispatch_loads_tab_sr_uidx
  on public.dispatch_loads (month_tab, sr)
  where deleted_at is null;

create index if not exists dispatch_loads_company_idx
  on public.dispatch_loads (lower(company_name))
  where deleted_at is null;

create index if not exists dispatch_loads_month_tab_idx
  on public.dispatch_loads (month_tab)
  where deleted_at is null;

create index if not exists dispatch_loads_driver_idx
  on public.dispatch_loads (assigned_driver_profile_id)
  where deleted_at is null;

-- ─── Dispatcher-editable carrier portal display ───────────────────────────────
create table if not exists public.dispatch_carrier_portal (
  id uuid primary key default gen_random_uuid(),
  carrier_profile_id uuid references public.profiles (id) on delete cascade,
  company_name text not null,
  portal_config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create unique index if not exists dispatch_carrier_portal_company_uidx
  on public.dispatch_carrier_portal (lower(company_name));

create unique index if not exists dispatch_carrier_portal_profile_uidx
  on public.dispatch_carrier_portal (carrier_profile_id)
  where carrier_profile_id is not null;

-- ─── Driver slot billing ($5 per carrier-invited driver) ─────────────────────
create table if not exists public.driver_slot_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  carrier_profile_id uuid not null references public.profiles (id) on delete cascade,
  driver_invitation_id uuid references public.driver_invitations (id) on delete set null,
  stripe_payment_intent_id text,
  amount_cents integer not null default 500,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed'))
);

create index if not exists driver_slot_payments_carrier_idx
  on public.driver_slot_payments (carrier_profile_id);

-- ─── Updated_at triggers ──────────────────────────────────────────────────────
create or replace function public.touch_dispatch_loads_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_dispatch_loads_updated on public.dispatch_loads;
create trigger trg_dispatch_loads_updated
  before update on public.dispatch_loads
  for each row execute function public.touch_dispatch_loads_updated_at();

create or replace function public.is_verified_carrier()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'carrier'
      and p.carrier_status = 'verified'
  );
$$;

create or replace function public.is_driver()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'driver'
  );
$$;

revoke all on function public.is_verified_carrier() from public;
grant execute on function public.is_verified_carrier() to authenticated;
revoke all on function public.is_driver() from public;
grant execute on function public.is_driver() to authenticated;

-- ─── RLS: dispatch_loads ──────────────────────────────────────────────────────
alter table public.dispatch_loads enable row level security;

drop policy if exists "dispatch_loads_dispatcher_all" on public.dispatch_loads;
create policy "dispatch_loads_dispatcher_all"
  on public.dispatch_loads for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "dispatch_loads_carrier_select" on public.dispatch_loads;
create policy "dispatch_loads_carrier_select"
  on public.dispatch_loads for select
  using (
    public.is_verified_carrier()
    and (
      carrier_profile_id = auth.uid()
      or lower(company_name) = lower(
        (select company_name from public.profiles where id = auth.uid())
      )
    )
    and deleted_at is null
  );

drop policy if exists "dispatch_loads_driver_select" on public.dispatch_loads;
create policy "dispatch_loads_driver_select"
  on public.dispatch_loads for select
  using (
    public.is_driver()
    and assigned_driver_profile_id = auth.uid()
    and deleted_at is null
  );

-- ─── RLS: dispatch_carrier_portal ───────────────────────────────────────────
alter table public.dispatch_carrier_portal enable row level security;

drop policy if exists "dispatch_carrier_portal_dispatcher_all" on public.dispatch_carrier_portal;
create policy "dispatch_carrier_portal_dispatcher_all"
  on public.dispatch_carrier_portal for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "dispatch_carrier_portal_carrier_select" on public.dispatch_carrier_portal;
create policy "dispatch_carrier_portal_carrier_select"
  on public.dispatch_carrier_portal for select
  using (
    public.is_verified_carrier()
    and (
      carrier_profile_id = auth.uid()
      or lower(company_name) = lower(
        (select company_name from public.profiles where id = auth.uid())
      )
    )
  );

-- ─── RLS: driver_slot_payments ────────────────────────────────────────────────
alter table public.driver_slot_payments enable row level security;

drop policy if exists "driver_slot_payments_carrier_select" on public.driver_slot_payments;
create policy "driver_slot_payments_carrier_select"
  on public.driver_slot_payments for select
  using (carrier_profile_id = auth.uid());

drop policy if exists "driver_slot_payments_dispatcher_select" on public.driver_slot_payments;
create policy "driver_slot_payments_dispatcher_select"
  on public.driver_slot_payments for select
  using (public.is_dispatcher());

grant select, insert, update, delete on public.dispatch_loads to authenticated;
grant select, insert, update, delete on public.dispatch_carrier_portal to authenticated;
grant select, insert on public.driver_slot_payments to authenticated;
