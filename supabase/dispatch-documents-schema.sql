-- Load documents (rate con, BOL, commodity, POD) stored in Supabase Storage.
-- Run after dispatch-platform-schema.sql

alter table public.dispatch_loads add column if not exists rate_con_path text;
alter table public.dispatch_loads add column if not exists bol_path text;
alter table public.dispatch_loads add column if not exists commodity_path text;
alter table public.dispatch_loads add column if not exists pod_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'freight-load-documents',
  'freight-load-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Server uploads via service role; clients use signed URLs from API routes.
