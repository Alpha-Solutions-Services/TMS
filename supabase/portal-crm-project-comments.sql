-- Project comments + client comment RLS (run after portal-crm.sql)

alter table public.portal_project_updates
  add column if not exists is_client boolean not null default false,
  add column if not exists sender_id uuid references auth.users (id) on delete set null;

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

grant insert on public.portal_project_updates to authenticated;
