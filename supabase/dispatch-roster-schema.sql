-- Dispatcher-managed carrier roster + driver assignments (run in Supabase SQL Editor)
create table if not exists public.dispatch_carrier_roster (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  mc text,
  mc_age text,
  contact_name text,
  phone text,
  company_name text not null,
  truck text,
  email text,
  address text,
  dispatch_review text,
  status text,
  sales_review text,
  sales_attention text,
  document_link text,
  source text not null default 'dispatcher' check (source in ('dispatcher', 'sheet'))
);

create index if not exists dispatch_carrier_roster_company_idx
  on public.dispatch_carrier_roster (lower(company_name));

create table if not exists public.dispatch_driver_roster (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  driver_name text not null,
  driver_email text,
  driver_phone text,
  carrier_roster_id uuid references public.dispatch_carrier_roster (id) on delete set null,
  carrier_profile_id uuid references public.profiles (id) on delete set null,
  carrier_company_name text not null,
  notes text
);

create index if not exists dispatch_driver_roster_carrier_idx
  on public.dispatch_driver_roster (carrier_company_name);

create or replace function public.touch_dispatch_roster_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_dispatch_carrier_roster_updated on public.dispatch_carrier_roster;
create trigger trg_dispatch_carrier_roster_updated
  before update on public.dispatch_carrier_roster
  for each row execute function public.touch_dispatch_roster_updated_at();

drop trigger if exists trg_dispatch_driver_roster_updated on public.dispatch_driver_roster;
create trigger trg_dispatch_driver_roster_updated
  before update on public.dispatch_driver_roster
  for each row execute function public.touch_dispatch_roster_updated_at();

alter table public.dispatch_carrier_roster enable row level security;
alter table public.dispatch_driver_roster enable row level security;

drop policy if exists "dispatch_carrier_roster_dispatcher_all" on public.dispatch_carrier_roster;
create policy "dispatch_carrier_roster_dispatcher_all"
  on public.dispatch_carrier_roster for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "dispatch_driver_roster_dispatcher_all" on public.dispatch_driver_roster;
create policy "dispatch_driver_roster_dispatcher_all"
  on public.dispatch_driver_roster for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

grant select, insert, update, delete on public.dispatch_carrier_roster to authenticated;
grant select, insert, update, delete on public.dispatch_driver_roster to authenticated;
