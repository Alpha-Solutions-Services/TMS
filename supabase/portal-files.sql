-- Client file uploads (portal documents)
-- Run in Supabase SQL Editor after portal-crm.sql

create table if not exists public.portal_files (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  is_admin_upload boolean not null default false,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  project_id uuid references public.portal_projects (id) on delete set null,
  note text
);

create index if not exists portal_files_user_idx
  on public.portal_files (user_id, created_at desc);

alter table public.portal_files enable row level security;

drop policy if exists "portal_files_select_own" on public.portal_files;
create policy "portal_files_select_own"
  on public.portal_files for select
  using (auth.uid() = user_id);

drop policy if exists "portal_files_insert_own" on public.portal_files;
create policy "portal_files_insert_own"
  on public.portal_files for insert
  with check (
    auth.uid() = user_id
    and is_admin_upload = false
    and uploaded_by = auth.uid()
  );

drop policy if exists "portal_files_delete_own" on public.portal_files;
create policy "portal_files_delete_own"
  on public.portal_files for delete
  using (auth.uid() = user_id and is_admin_upload = false);

grant select, insert, delete on public.portal_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-files',
  'portal-files',
  false,
  15728640,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "portal_files_storage_select" on storage.objects;
create policy "portal_files_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'portal-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "portal_files_storage_insert" on storage.objects;
create policy "portal_files_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'portal-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "portal_files_storage_delete" on storage.objects;
create policy "portal_files_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'portal-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
