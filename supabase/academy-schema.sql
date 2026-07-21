-- Academy + instructor portal + enrollment payment approval.
-- Run after freight-schema.sql

-- Allow pending enrollment (awaiting payment confirmation by dispatcher)
alter table public.profiles drop constraint if exists profiles_enrollment_status_check;
alter table public.profiles
  add constraint profiles_enrollment_status_check
  check (enrollment_status in ('unpaid', 'pending', 'paid', 'refunded'));

-- Instructor role
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('client', 'dispatcher', 'carrier', 'driver', 'student', 'admin', 'instructor'));

alter table public.profiles add column if not exists payment_confirmed_at timestamptz;
alter table public.profiles add column if not exists payment_confirmed_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists payment_notes text;

-- Course modules
create table if not exists public.academy_modules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sort_order integer not null default 0,
  title text not null,
  summary text,
  content_md text,
  is_published boolean not null default false
);

create index if not exists academy_modules_order_idx on public.academy_modules (sort_order);

-- Student progress per module
create table if not exists public.academy_progress (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  module_id uuid not null references public.academy_modules (id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  instructor_note text,
  unique (student_id, module_id)
);

create index if not exists academy_progress_student_idx on public.academy_progress (student_id);

-- Instructor notes / coordination with a student
create table if not exists public.academy_student_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null
);

create index if not exists academy_student_notes_student_idx
  on public.academy_student_notes (student_id, created_at desc);

alter table public.academy_modules enable row level security;
alter table public.academy_progress enable row level security;
alter table public.academy_student_notes enable row level security;

drop policy if exists "academy_modules_read_published" on public.academy_modules;
create policy "academy_modules_read_published"
  on public.academy_modules for select
  using (
    is_published = true
    or public.is_dispatcher()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'instructor'
    )
  );

drop policy if exists "academy_modules_dispatcher_all" on public.academy_modules;
create policy "academy_modules_dispatcher_all"
  on public.academy_modules for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "academy_progress_own_or_staff" on public.academy_progress;
create policy "academy_progress_own_or_staff"
  on public.academy_progress for select
  using (
    student_id = auth.uid()
    or public.is_dispatcher()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'instructor'
    )
  );

drop policy if exists "academy_progress_staff_write" on public.academy_progress;
create policy "academy_progress_staff_write"
  on public.academy_progress for all
  using (
    public.is_dispatcher()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'instructor'
    )
  )
  with check (
    public.is_dispatcher()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'instructor'
    )
  );

drop policy if exists "academy_notes_staff" on public.academy_student_notes;
create policy "academy_notes_staff"
  on public.academy_student_notes for all
  using (
    public.is_dispatcher()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('instructor', 'student')
    )
  )
  with check (
    public.is_dispatcher()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'instructor'
    )
  );

grant select, insert, update, delete on public.academy_modules to authenticated;
grant select, insert, update, delete on public.academy_progress to authenticated;
grant select, insert, update, delete on public.academy_student_notes to authenticated;

-- Seed starter modules (idempotent by title)
insert into public.academy_modules (sort_order, title, summary, is_published)
select * from (values
  (1, 'Introduction to Freight Dispatch', 'Industry overview, roles, and how Alpha Freight operates.', true),
  (2, 'Load Boards & Finding Freight', 'DAT, Truckstop, and posting discipline.', true),
  (3, 'Rate Negotiation Basics', 'When to walk, when to commit, and documenting RC.', true),
  (4, 'Booking to Delivery Workflow', 'From booking confirmation through POD.', true),
  (5, 'Carrier Compliance Touchpoints', 'High-level FMCSA awareness for dispatchers.', true)
) as v(sort_order, title, summary, is_published)
where not exists (
  select 1 from public.academy_modules m where m.title = v.title
);
