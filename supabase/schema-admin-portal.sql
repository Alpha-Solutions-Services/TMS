-- Run in Supabase SQL Editor (once). Service role is used from Next API for contact + admin writes.

-- ─── Contact form (website inquiries) ─────────────────────────────────────
create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  budget text,
  service_slug text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  admin_notes text,
  read_at timestamptz
);

create index if not exists contact_inquiries_created_at_idx
  on public.contact_inquiries (created_at desc);
create index if not exists contact_inquiries_status_idx
  on public.contact_inquiries (status);

alter table public.contact_inquiries enable row level security;

-- No policies: only service role / dashboard can access (never expose service key to browser).

-- ─── Admin ↔ client direct messages ────────────────────────────────────────
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users (id) on delete cascade,
  client_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_user_id)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_thread_created_idx
  on public.dm_messages (thread_id, created_at desc);

alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;

-- Clients: own thread
create policy "dm_threads_select_own"
  on public.dm_threads for select
  using (auth.uid() = client_user_id);

create policy "dm_threads_insert_own"
  on public.dm_threads for insert
  with check (auth.uid() = client_user_id);

create policy "dm_threads_update_own"
  on public.dm_threads for update
  using (auth.uid() = client_user_id);

-- Clients: messages in own thread
create policy "dm_messages_select_own_thread"
  on public.dm_messages for select
  using (
    exists (
      select 1 from public.dm_threads t
      where t.id = thread_id and t.client_user_id = auth.uid()
    )
  );

create policy "dm_messages_insert_as_client"
  on public.dm_messages for insert
  with check (
    is_admin = false
    and sender_id = auth.uid()
    and exists (
      select 1 from public.dm_threads t
      where t.id = thread_id and t.client_user_id = auth.uid()
    )
  );

-- ─── Optional: lightweight page views for admin stats ──────────────────────
create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx
  on public.page_views (created_at desc);

alter table public.page_views enable row level security;
-- No policies: only service role (Next API) inserts/selects page_views.

grant usage on schema public to anon, authenticated;
grant insert, select, update on public.dm_threads to authenticated;
grant insert, select on public.dm_messages to authenticated;
