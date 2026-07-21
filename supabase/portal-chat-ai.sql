-- Alpha Portal: DM upgrades + AI tables + storage
-- Run in Supabase SQL Editor against the shared project (does NOT touch freight tables).

-- ─── DM message attachments + edit/soft-delete ─────────────────────────────
alter table public.dm_messages
  alter column body drop not null;

alter table public.dm_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_name text,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.dm_threads
  add column if not exists client_last_read_at timestamptz,
  add column if not exists admin_last_read_at timestamptz;

-- Clients may update/soft-delete their own messages
drop policy if exists "dm_messages_update_own" on public.dm_messages;
create policy "dm_messages_update_own"
  on public.dm_messages for update
  using (
    sender_id = auth.uid()
    and is_admin = false
    and exists (
      select 1 from public.dm_threads t
      where t.id = thread_id and t.client_user_id = auth.uid()
    )
  );

-- Allow empty body when attachment present (app-enforced); keep body default ''
update public.dm_messages set body = coalesce(body, '') where body is null;
alter table public.dm_messages alter column body set default '';

-- ─── AI chatbot history (portal only) ──────────────────────────────────────
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx
  on public.ai_conversations (user_id, updated_at desc);
create index if not exists ai_messages_conv_idx
  on public.ai_messages (conversation_id, created_at);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "ai_conversations_select_own" on public.ai_conversations;
create policy "ai_conversations_select_own"
  on public.ai_conversations for select using (auth.uid() = user_id);

drop policy if exists "ai_conversations_insert_own" on public.ai_conversations;
create policy "ai_conversations_insert_own"
  on public.ai_conversations for insert with check (auth.uid() = user_id);

drop policy if exists "ai_conversations_update_own" on public.ai_conversations;
create policy "ai_conversations_update_own"
  on public.ai_conversations for update using (auth.uid() = user_id);

drop policy if exists "ai_messages_select_own" on public.ai_messages;
create policy "ai_messages_select_own"
  on public.ai_messages for select
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "ai_messages_insert_own" on public.ai_messages;
create policy "ai_messages_insert_own"
  on public.ai_messages for insert
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

grant select, insert, update on public.ai_conversations to authenticated;
grant select, insert on public.ai_messages to authenticated;

-- ─── Storage bucket for DM images ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dm-attachments',
  'dm-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated users can upload into their own folder (userId/...)
drop policy if exists "dm_attachments_upload_own" on storage.objects;
create policy "dm_attachments_upload_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dm-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dm_attachments_select_own" on storage.objects;
create policy "dm_attachments_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dm-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Enable realtime for dm_messages (ignore if already added)
do $$
begin
  alter publication supabase_realtime add table public.dm_messages;
exception
  when duplicate_object then null;
end $$;
