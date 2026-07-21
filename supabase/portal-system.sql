-- Alpha Portal system expansion: pipeline, quotes, bookings, contracts,
-- notifications, knowledge base, staff roles, milestone approvals.
-- Run in Supabase SQL Editor after portal-crm.sql / portal-files.sql.

-- ─── Staff roles (DB-managed, beyond ADMIN_EMAILS) ─────────────────────────
create table if not exists public.portal_staff (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique,
  role text not null default 'staff'
    check (role in ('owner', 'staff')),
  display_name text,
  active boolean not null default true,
  invited_by uuid references auth.users (id) on delete set null
);

create index if not exists portal_staff_email_idx on public.portal_staff (lower(email));

alter table public.portal_staff enable row level security;
-- Service role only for writes; no client policies needed for staff table.

-- ─── Pipeline deals (inquiry → quote → win/loss) ───────────────────────────
create table if not exists public.portal_deals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inquiry_id uuid references public.contact_inquiries (id) on delete set null,
  client_email text,
  client_name text,
  client_user_id uuid references auth.users (id) on delete set null,
  title text not null,
  service_slug text,
  stage text not null default 'inquiry'
    check (stage in (
      'inquiry', 'qualified', 'quoted', 'negotiation',
      'won', 'lost', 'on_hold'
    )),
  estimated_value numeric(12,2),
  currency text not null default 'USD',
  loss_reason text,
  win_notes text,
  project_id uuid references public.portal_projects (id) on delete set null,
  owner_email text,
  notes text
);

create index if not exists portal_deals_stage_idx on public.portal_deals (stage, updated_at desc);

-- ─── Quotes ────────────────────────────────────────────────────────────────
create table if not exists public.portal_quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deal_id uuid references public.portal_deals (id) on delete cascade,
  client_email text not null,
  client_name text,
  title text not null,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  valid_until date,
  notes text,
  sent_at timestamptz,
  responded_at timestamptz
);

-- ─── Booking slots + appointments ──────────────────────────────────────────
create table if not exists public.portal_booking_slots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'demo'
    check (kind in ('demo', 'kickoff', 'review', 'other')),
  capacity int not null default 1,
  booked_count int not null default 0,
  active boolean not null default true,
  notes text
);

create table if not exists public.portal_bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slot_id uuid references public.portal_booking_slots (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'demo',
  client_user_id uuid references auth.users (id) on delete set null,
  client_email text not null,
  client_name text,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  meeting_url text,
  cal_com_url text,
  notes text,
  deal_id uuid references public.portal_deals (id) on delete set null,
  project_id uuid references public.portal_projects (id) on delete set null
);

create index if not exists portal_bookings_client_idx
  on public.portal_bookings (client_user_id, starts_at);

-- ─── Contracts + deposit invoices ──────────────────────────────────────────
create table if not exists public.portal_contracts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deal_id uuid references public.portal_deals (id) on delete set null,
  project_id uuid references public.portal_projects (id) on delete set null,
  client_email text not null,
  client_name text,
  client_user_id uuid references auth.users (id) on delete set null,
  title text not null,
  body text not null,
  status text not null default 'draft'
    check (status in (
      'draft', 'sent', 'viewed', 'signed', 'declined', 'void'
    )),
  sign_token text unique,
  signed_at timestamptz,
  signed_name text,
  signed_ip text,
  deposit_amount numeric(12,2),
  deposit_currency text not null default 'USD',
  deposit_status text not null default 'not_required'
    check (deposit_status in (
      'not_required', 'pending', 'paid', 'waived', 'refunded'
    )),
  invoice_url text,
  invoice_ref text
);

create index if not exists portal_contracts_token_idx
  on public.portal_contracts (sign_token);

-- ─── In-app notifications ──────────────────────────────────────────────────
create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  href text,
  kind text not null default 'info',
  read_at timestamptz,
  meta jsonb
);

create index if not exists portal_notifications_user_idx
  on public.portal_notifications (user_id, created_at desc);

alter table public.portal_notifications enable row level security;

drop policy if exists "portal_notifications_select_own" on public.portal_notifications;
create policy "portal_notifications_select_own"
  on public.portal_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "portal_notifications_update_own" on public.portal_notifications;
create policy "portal_notifications_update_own"
  on public.portal_notifications for update
  using (auth.uid() = user_id);

grant select, update on public.portal_notifications to authenticated;

-- ─── Knowledge base / SOPs for Alpha Assistant ─────────────────────────────
create table if not exists public.portal_knowledge (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  category text not null default 'general',
  question text not null,
  answer text not null,
  tags text[] default '{}',
  active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists portal_knowledge_active_idx
  on public.portal_knowledge (active, sort_order);

-- ─── Milestone client approvals ────────────────────────────────────────────
alter table public.portal_project_milestones
  add column if not exists due_date date,
  add column if not exists requires_approval boolean not null default false,
  add column if not exists approval_status text default 'none'
    check (approval_status in ('none', 'pending', 'approved', 'changes_requested')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists client_note text;

-- due_date may already exist from portal-crm — IF NOT EXISTS is fine.

-- ─── Client RLS for quotes / bookings / contracts (read own) ───────────────
alter table public.portal_quotes enable row level security;
alter table public.portal_bookings enable row level security;
alter table public.portal_contracts enable row level security;
alter table public.portal_deals enable row level security;

drop policy if exists "portal_quotes_select_own" on public.portal_quotes;
create policy "portal_quotes_select_own"
  on public.portal_quotes for select
  using (
    lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "portal_bookings_select_own" on public.portal_bookings;
create policy "portal_bookings_select_own"
  on public.portal_bookings for select
  using (
    client_user_id = auth.uid()
    or lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "portal_bookings_insert_own" on public.portal_bookings;
create policy "portal_bookings_insert_own"
  on public.portal_bookings for insert
  with check (
    client_user_id = auth.uid()
    or lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "portal_contracts_select_own" on public.portal_contracts;
create policy "portal_contracts_select_own"
  on public.portal_contracts for select
  using (
    client_user_id = auth.uid()
    or lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

grant select on public.portal_quotes to authenticated;
grant select, insert on public.portal_bookings to authenticated;
grant select on public.portal_contracts to authenticated;
grant select on public.portal_booking_slots to authenticated;

alter table public.portal_booking_slots enable row level security;
drop policy if exists "portal_slots_select_active" on public.portal_booking_slots;
create policy "portal_slots_select_active"
  on public.portal_booking_slots for select
  using (active = true and booked_count < capacity and starts_at > now());
