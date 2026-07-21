-- Dispatcher super-admin: per-carrier billing override + portal messaging.
-- Run in Supabase SQL Editor after dispatch-platform-schema.sql.

alter table public.profiles add column if not exists carrier_billing_mode text;
alter table public.profiles add column if not exists carrier_billing_note text;

-- standard = trial/Stripe required · free = dispatcher-granted lifetime access
alter table public.profiles drop constraint if exists profiles_carrier_billing_mode_check;
alter table public.profiles add constraint profiles_carrier_billing_mode_check
  check (
    carrier_billing_mode is null
    or carrier_billing_mode in ('standard', 'free')
  );

create table if not exists public.dispatch_carrier_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  carrier_profile_id uuid not null references public.profiles (id) on delete cascade,
  sender_profile_id uuid not null references public.profiles (id) on delete set null,
  sender_role text not null check (sender_role in ('dispatcher', 'carrier')),
  body text not null,
  read_at timestamptz
);

create index if not exists dispatch_carrier_messages_carrier_idx
  on public.dispatch_carrier_messages (carrier_profile_id, created_at desc);

alter table public.dispatch_carrier_messages enable row level security;

drop policy if exists "dispatch_carrier_messages_dispatcher_all" on public.dispatch_carrier_messages;
create policy "dispatch_carrier_messages_dispatcher_all"
  on public.dispatch_carrier_messages for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "dispatch_carrier_messages_carrier_select" on public.dispatch_carrier_messages;
create policy "dispatch_carrier_messages_carrier_select"
  on public.dispatch_carrier_messages for select
  using (
    public.is_verified_carrier()
    and carrier_profile_id = auth.uid()
  );

drop policy if exists "dispatch_carrier_messages_carrier_insert" on public.dispatch_carrier_messages;
create policy "dispatch_carrier_messages_carrier_insert"
  on public.dispatch_carrier_messages for insert
  with check (
    public.is_verified_carrier()
    and carrier_profile_id = auth.uid()
    and sender_profile_id = auth.uid()
    and sender_role = 'carrier'
  );

grant select, insert, update, delete on public.dispatch_carrier_messages to authenticated;

-- Dispatcher may update carrier profiles (billing, company info, status)
drop policy if exists "profiles_dispatcher_update_carriers" on public.profiles;
create policy "profiles_dispatcher_update_carriers"
  on public.profiles for update
  using (public.is_dispatcher() and role = 'carrier')
  with check (role = 'carrier');

drop policy if exists "profiles_dispatcher_select_carriers" on public.profiles;
create policy "profiles_dispatcher_select_carriers"
  on public.profiles for select
  using (public.is_dispatcher() and role = 'carrier');
