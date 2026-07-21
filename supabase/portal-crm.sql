-- Portal CRM: projects, tickets, AI human handoff
-- Run in Supabase SQL Editor (shared project). Does NOT touch freight.

-- ─── Portal projects (admin-created CRM projects) ──────────────────────────
create table if not exists public.portal_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_user_id uuid references auth.users (id) on delete set null,
  client_email text,
  title text not null,
  description text,
  status text not null default 'planning'
    check (status in ('planning', 'in_progress', 'review', 'completed', 'on_hold')),
  progress int not null default 0 check (progress >= 0 and progress <= 100),
  category text,
  project_url text,
  created_by uuid references auth.users (id) on delete set null
);

create table if not exists public.portal_project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_projects (id) on delete cascade,
  title text not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done')),
  due_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_project_team (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_projects (id) on delete cascade,
  name text not null,
  role text,
  avatar_url text,
  sort_order int not null default 0
);

create table if not exists public.portal_project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_projects (id) on delete cascade,
  author text,
  title text,
  body text not null,
  is_client boolean not null default false,
  sender_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Existing installs: add comment columns if table already existed without them
alter table public.portal_project_updates
  add column if not exists is_client boolean not null default false,
  add column if not exists sender_id uuid references auth.users (id) on delete set null;

create index if not exists portal_projects_client_idx
  on public.portal_projects (client_user_id, updated_at desc);

-- ─── Support tickets ───────────────────────────────────────────────────────
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_user_id uuid not null references auth.users (id) on delete cascade,
  client_email text,
  project_id uuid references public.portal_projects (id) on delete set null,
  subject text not null,
  description text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting_client', 'resolved', 'closed')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  ai_conversation_id uuid references public.ai_conversations (id) on delete set null
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  is_admin boolean not null default false,
  is_ai boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_client_idx
  on public.support_tickets (client_user_id, updated_at desc);
create index if not exists support_tickets_status_idx
  on public.support_tickets (status, updated_at desc);

-- ─── AI conversation upgrades (human handoff + training memory) ────────────
alter table public.ai_conversations
  add column if not exists client_email text,
  add column if not exists human_joined boolean not null default false,
  add column if not exists human_joined_at timestamptz,
  add column if not exists human_admin_id uuid,
  add column if not exists training_notes text,
  add column if not exists ticket_id uuid;

alter table public.ai_messages
  add column if not exists is_human boolean not null default false;

-- ─── RLS ───────────────────────────────────────────────────────────────────
alter table public.portal_projects enable row level security;
alter table public.portal_project_milestones enable row level security;
alter table public.portal_project_team enable row level security;
alter table public.portal_project_updates enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists "portal_projects_select_own" on public.portal_projects;
create policy "portal_projects_select_own"
  on public.portal_projects for select
  using (auth.uid() = client_user_id);

drop policy if exists "portal_milestones_select_own" on public.portal_project_milestones;
create policy "portal_milestones_select_own"
  on public.portal_project_milestones for select
  using (
    exists (
      select 1 from public.portal_projects p
      where p.id = project_id and p.client_user_id = auth.uid()
    )
  );

drop policy if exists "portal_team_select_own" on public.portal_project_team;
create policy "portal_team_select_own"
  on public.portal_project_team for select
  using (
    exists (
      select 1 from public.portal_projects p
      where p.id = project_id and p.client_user_id = auth.uid()
    )
  );

drop policy if exists "portal_updates_select_own" on public.portal_project_updates;
create policy "portal_updates_select_own"
  on public.portal_project_updates for select
  using (
    exists (
      select 1 from public.portal_projects p
      where p.id = project_id and p.client_user_id = auth.uid()
    )
  );

drop policy if exists "portal_updates_insert_client" on public.portal_project_updates;
create policy "portal_updates_insert_client"
  on public.portal_project_updates for insert
  with check (
    is_client = true
    and sender_id = auth.uid()
    and exists (
      select 1 from public.portal_projects p
      where p.id = project_id and p.client_user_id = auth.uid()
    )
  );

drop policy if exists "tickets_select_own" on public.support_tickets;
create policy "tickets_select_own"
  on public.support_tickets for select
  using (auth.uid() = client_user_id);

drop policy if exists "tickets_insert_own" on public.support_tickets;
create policy "tickets_insert_own"
  on public.support_tickets for insert
  with check (auth.uid() = client_user_id);

drop policy if exists "tickets_update_own" on public.support_tickets;
create policy "tickets_update_own"
  on public.support_tickets for update
  using (auth.uid() = client_user_id);

drop policy if exists "ticket_msgs_select_own" on public.support_ticket_messages;
create policy "ticket_msgs_select_own"
  on public.support_ticket_messages for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.client_user_id = auth.uid()
    )
  );

drop policy if exists "ticket_msgs_insert_own" on public.support_ticket_messages;
create policy "ticket_msgs_insert_own"
  on public.support_ticket_messages for insert
  with check (
    is_admin = false
    and is_ai = false
    and sender_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.client_user_id = auth.uid()
    )
  );

grant select on public.portal_projects to authenticated;
grant select on public.portal_project_milestones to authenticated;
grant select on public.portal_project_team to authenticated;
grant select, insert on public.portal_project_updates to authenticated;
grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_ticket_messages to authenticated;
