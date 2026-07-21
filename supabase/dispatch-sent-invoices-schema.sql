-- Sent carrier invoices — tracks email sends and payment status.
-- Run after dispatch-platform-schema.sql

create table if not exists public.dispatch_sent_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  invoice_number text not null,
  month_tab text not null,
  carrier_name text not null,
  carrier_email text,
  invoice_date date not null,
  due_date date not null,
  amount_total numeric not null default 0,
  amount_received numeric not null default 0,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid')),
  payment_method text,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.profiles (id) on delete set null,
  line_items jsonb not null default '[]'::jsonb,
  notes text
);

create unique index if not exists dispatch_sent_invoices_number_uidx
  on public.dispatch_sent_invoices (lower(invoice_number))
  where deleted_at is null;

create index if not exists dispatch_sent_invoices_month_idx
  on public.dispatch_sent_invoices (month_tab, sent_at desc)
  where deleted_at is null;

create index if not exists dispatch_sent_invoices_carrier_idx
  on public.dispatch_sent_invoices (lower(carrier_name))
  where deleted_at is null;

create or replace function public.touch_dispatch_sent_invoices_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_dispatch_sent_invoices_updated on public.dispatch_sent_invoices;
create trigger trg_dispatch_sent_invoices_updated
  before update on public.dispatch_sent_invoices
  for each row execute function public.touch_dispatch_sent_invoices_updated_at();

alter table public.dispatch_sent_invoices enable row level security;

drop policy if exists "dispatch_sent_invoices_dispatcher_all" on public.dispatch_sent_invoices;
create policy "dispatch_sent_invoices_dispatcher_all"
  on public.dispatch_sent_invoices for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

grant select, insert, update, delete on public.dispatch_sent_invoices to authenticated;
