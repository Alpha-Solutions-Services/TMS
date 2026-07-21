-- Alpha Freight schema: profiles extensions, enrollment_plans, driver_invitations, RLS.
-- Run once in Supabase SQL Editor (verify order). UPDATE enrollment_plans.stripe_price_id after Stripe setup.

-- ─── Profiles ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text,
  full_name text,
  phone text,
  role text not null default 'client' check (
    role in ('client', 'dispatcher', 'carrier', 'driver', 'student', 'admin')
  ),

  mc_number text,
  dot_number text,
  company_name text,
  company_address text,
  carrier_status text not null default 'pending' check (
    carrier_status in ('pending', 'verified', 'suspended', 'rejected')
  ),
  fmcsa_verified boolean not null default false,
  fmcsa_verified_at timestamptz,
  fmcsa_data jsonb,

  enrollment_status text not null default 'unpaid' check (
    enrollment_status in ('unpaid', 'paid', 'refunded')
  ),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  enrolled_at timestamptz,
  enrollment_plan text check (enrollment_plan is null or enrollment_plan in ('monthly', 'lifetime')),

  carrier_id uuid references public.profiles (id) on delete set null,

  cdl_number text,
  cdl_state text,
  cdl_expiry date,
  carrier_review_note text
);

-- Idempotent columns (profiles may already exist with partial columns from prior runs)
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists mc_number text;
alter table public.profiles add column if not exists dot_number text;
alter table public.profiles add column if not exists company_name text;
alter table public.profiles add column if not exists company_address text;
alter table public.profiles add column if not exists carrier_status text;
alter table public.profiles add column if not exists fmcsa_verified boolean;
alter table public.profiles add column if not exists fmcsa_verified_at timestamptz;
alter table public.profiles add column if not exists fmcsa_data jsonb;
alter table public.profiles add column if not exists enrollment_status text;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists stripe_payment_intent_id text;
alter table public.profiles add column if not exists enrolled_at timestamptz;
alter table public.profiles add column if not exists enrollment_plan text;
alter table public.profiles add column if not exists carrier_id uuid;
alter table public.profiles add column if not exists cdl_number text;
alter table public.profiles add column if not exists cdl_state text;
alter table public.profiles add column if not exists cdl_expiry date;
alter table public.profiles add column if not exists carrier_review_note text;

create unique index if not exists profiles_mc_number_uidx on public.profiles (mc_number)
  where mc_number is not null;
create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.touch_profile_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

create or replace function public.is_dispatcher()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'dispatcher'
  );
$$;

revoke all on function public.is_dispatcher() from public;
grant execute on function public.is_dispatcher() to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_dispatcher_freight_users" on public.profiles;
create policy "profiles_dispatcher_freight_users"
  on public.profiles for select
  using (
    public.is_dispatcher()
    and role in ('carrier', 'driver', 'student')
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);

-- Dispatcher can approve/reject carriers
drop policy if exists "profiles_dispatcher_update_carriers" on public.profiles;
create policy "profiles_dispatcher_update_carriers"
  on public.profiles for update
  using (public.is_dispatcher() and role = 'carrier')
  with check (role = 'carrier');

-- ─── Enrollment plans ───────────────────────────────────────────────────────
create table if not exists public.enrollment_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null check (slug in ('monthly', 'lifetime')),
  price_cents integer not null,
  stripe_price_id text not null,
  billing_interval text not null check (billing_interval in ('month', 'one_time')),
  features text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.enrollment_plans enable row level security;

drop policy if exists "enrollment_plans_public_read" on public.enrollment_plans;
create policy "enrollment_plans_public_read"
  on public.enrollment_plans for select
  using (true);

-- ─── Driver invitations ─────────────────────────────────────────────────────
create table if not exists public.driver_invitations (
  id uuid primary key default gen_random_uuid(),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  inviter_role text not null check (inviter_role in ('carrier', 'dispatcher')),
  driver_email text not null,
  driver_name text,
  carrier_id uuid not null references public.profiles (id) on delete cascade,
  token text unique not null,
  status text not null default 'pending' check (
    status in ('pending', 'accepted', 'expired', 'cancelled')
  ),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index if not exists driver_invitations_token_idx on public.driver_invitations (token);

alter table public.driver_invitations enable row level security;

drop policy if exists "driver_inv_select_parties" on public.driver_invitations;
create policy "driver_inv_select_parties"
  on public.driver_invitations for select using (
    invited_by = auth.uid()
    or carrier_id = auth.uid()
    or public.is_dispatcher()
  );

drop policy if exists "driver_inv_insert_carrier" on public.driver_invitations;
create policy "driver_inv_insert_carrier"
  on public.driver_invitations for insert
  with check (
    inviter_role = 'carrier'
    and invited_by = auth.uid()
    and carrier_id = auth.uid()
    and exists (
      select 1 from public.profiles c
      where c.id = auth.uid() and c.role = 'carrier' and c.carrier_status = 'verified'
    )
  );

drop policy if exists "driver_inv_insert_dispatcher" on public.driver_invitations;
create policy "driver_inv_insert_dispatcher"
  on public.driver_invitations for insert
  with check (
    inviter_role = 'dispatcher'
    and invited_by = auth.uid()
    and public.is_dispatcher()
    and carrier_id in (select id from public.profiles where role = 'carrier' and carrier_status = 'verified')
  );

drop policy if exists "driver_inv_delete_own_or_dispatcher" on public.driver_invitations;
create policy "driver_inv_delete_own_or_dispatcher"
  on public.driver_invitations for delete
  using (invited_by = auth.uid() or public.is_dispatcher());

drop policy if exists "driver_inv_update_own_or_dispatcher" on public.driver_invitations;
create policy "driver_inv_update_own_or_dispatcher"
  on public.driver_invitations for update
  using (invited_by = auth.uid() or public.is_dispatcher())
  with check (invited_by = auth.uid() or public.is_dispatcher());

-- ─── Email collision check (students) — callable only via service_role REST ─────
create or replace function public.check_freight_email_registered(candidate text)
returns boolean
language sql
security definer
set search_path = auth
as $$
  select exists (
    select 1 from auth.users
    where lower(trim(email)) = lower(trim(candidate))
  );
$$;

revoke all on function public.check_freight_email_registered(text) from public;
grant execute on function public.check_freight_email_registered(text) to service_role;

grant usage on schema public to anon, authenticated;

grant select on public.enrollment_plans to anon, authenticated;
grant insert, select, update, delete on public.driver_invitations to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- ─── Seeds ──────────────────────────────────────────────────────────────────
insert into public.enrollment_plans (name, slug, price_cents, stripe_price_id, billing_interval, features, is_active)
values
(
  'Monthly Access',
  'monthly',
  4900,
  'REPLACE_STRIPE_MONTHLY_PRICE_ID',
  'month',
  array['All lessons & quizzes','Practice load board module','Email support'],
  true
),
(
  'Lifetime Access',
  'lifetime',
  12000,
  'REPLACE_STRIPE_LIFETIME_PRICE_ID',
  'one_time',
  array[
    'All 10 lessons','All quizzes','Practice mode','Community access',
    'Certificate of completion','Priority support'
  ],
  true
)
on conflict (slug) do nothing;
