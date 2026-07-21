-- Seed dispatch_loads from Google Sheet tabs: May 2026 + June 2026
-- Run in Supabase SQL Editor AFTER dispatch-platform-schema.sql (and dispatch-documents-schema.sql if used)
--
-- Re-runnable: deletes prior import rows for these tabs, then inserts SR 1–8 (June) and 1–9 (May).
-- Month tabs match the workbook: "May 2026", "June 2026" (same as DispatchMonthSelector / Google Sheet).

begin;

delete from public.dispatch_loads
where month_tab in ('May 2026', 'June 2026')
  and source = 'import';

-- ─── June 2026 (8 loads) ─────────────────────────────────────────────────────
insert into public.dispatch_loads (
  month_tab, sr, source, booked_by, rc_date, truck_trailer, company_name, broker,
  load_details, pickup_date_time, delivery_date_time, miles, load_number, states,
  rc_invoice, dispatch_percent, dispatch_fee, invoice, received, balance,
  status, cpay
) values
  ('June 2026', 1, 'import', 'Mikran', '06/08/2026', '26ft Box', 'ABO TRUCKING LLC', 'American Logistics Group', '2 Crates', '06/08/2026', '06/09/2026', 190, '376965', 'TX-TX', 375, 6, 22.50, 'Sent', 22.50, 0, 'Paid', 'Factoring'),
  ('June 2026', 2, 'import', 'Mikran', '06/09/2026', '26ft Box', 'ABO TRUCKING LLC', 'Foresee Logistics Inc', '2 Crates', '06/09/2026', '06/09/2026', 136, '51129165', 'TX-TX', 500, 6, 30.00, 'Sent', 30.00, 0, 'Paid', 'Factoring'),
  ('June 2026', 3, 'import', 'Mikran', '06/09/2026', '26ft Box', 'ABO TRUCKING LLC', 'Primary Freight', '6 pieces', '06/09/2026', '06/10/2026', 101, '129718153', 'TX-TX', 400, 6, 24.00, 'Sent', 24.00, 0, 'Paid', 'Factoring'),
  ('June 2026', 4, 'import', 'Mikran', '06/10/2026', '26ft Box', 'ABO TRUCKING LLC', 'TQL', '9 pallets', '06/10/2026', '06/10/2026', 188, '37126009', 'TX-TX', 400, 6, 24.00, 'Sent', 24.00, 0, 'Paid', 'Factoring'),
  ('June 2026', 5, 'import', 'Mikran', '06/10/2026', '26ft Box', 'ABO TRUCKING LLC', 'DFS', '4 pallets', '06/11/2026', '06/11/2026', 79, '47286', 'TX-TX', 275, 6, 16.50, 'Sent', 26.00, -9.50, 'Paid', 'Factoring'),
  ('June 2026', 6, 'import', 'Sarmad', '6/12/2026', '26ft Box', '5280 Enterprises LLC', 'Global transport', '4 pallets', '6/12/2026', '6/12/2026', 339, '32737027', 'TX-TX', 1200, 7, 84.00, 'Sent', 84.00, 0, 'Paid', 'Quick Pay'),
  ('June 2026', 7, 'import', 'Mikran', '06/16/2026', '26ft Box', 'ABO TRUCKING LLC', 'ATS', 'Bottles', '06/16/2026', '06/16/2026', 197, '10524033', 'TX-TX', 575, 6, 34.50, 'Pending', 0, 34.50, 'Unpaid', 'Quick Pay'),
  ('June 2026', 8, 'import', 'Mikran', '06/16/2026', '26ft Box', 'ABO TRUCKING LLC', 'Light House', 'Bottles', '06/16/2026', '06/16/2026', 197, '70000-236144', 'TX-TX', 630, 6, 37.80, 'Pending', 0, 37.80, 'Unpaid', 'Quick Pay');

-- Link ABO TRUCKING LLC loads to verified carrier profile when present
update public.dispatch_loads dl
set carrier_profile_id = p.id
from public.profiles p
where dl.month_tab = 'June 2026'
  and dl.source = 'import'
  and lower(dl.company_name) = lower('ABO TRUCKING LLC')
  and p.role = 'carrier'
  and p.carrier_status = 'verified'
  and lower(p.company_name) = lower('ABO TRUCKING LLC');

-- ─── May 2026 (9 loads) ──────────────────────────────────────────────────────
insert into public.dispatch_loads (
  month_tab, sr, source, booked_by, rc_date, truck_trailer, company_name, broker,
  load_details, pickup_date_time, delivery_date_time, miles, load_number, states,
  rc_invoice, dispatch_percent, dispatch_fee, invoice, received, balance,
  status, cpay
) values
  ('May 2026', 1, 'import', 'Mikran', '5/18/2026', '26', 'Kenneth', 'TQL', '36723469', '5/18/2026', '5/19/2026', 385, '36723469', 'IL TO MO', 750, 5, 37.50, 'Sent', 37.50, 0, 'Paid', 'Quick Pay'),
  ('May 2026', 2, 'import', 'Mikran', '5/20/2026', '26', 'Kenneth', 'TQL', '36803187', '5/20/2026', '5/21/2026', 211, '36803187', 'IL to WI', 450, 5, 22.50, 'Sent', 22.50, 0, 'Paid', 'Quick Pay'),
  ('May 2026', 3, 'import', 'Mikran', '5/21/2026', '26', 'Kenneth', 'adroit', '18830', '5/21/2026', '5/21/2026', 100, '18830', 'IL to WI', 500, 5, 25.00, 'Sent', 25.00, 0, 'Paid', 'Quick Pay'),
  ('May 2026', 4, 'import', 'Sarmad', '5/18/2026', '26', 'Christina', 'American Logistics', '371685', '5/21/2026', '5/21/2026', 300, '15654', 'AR TO TX', 900, 8, 72.00, 'Sent', 72.00, 0, 'Paid', 'Quick Pay'),
  ('May 2026', 5, 'import', 'Mikran', '5/26/2026', '26', 'Kenneth', 'TQL', '36903397', '5/26/2026', '5/26/2026', 69, '36903397', 'IL to WI', 250, 5, 12.50, 'Sent', 12.50, 0, 'Paid', 'Quick Pay'),
  ('May 2026', 6, 'import', 'Mikran', '5/26/2026', '26', 'Kenneth', 'Jorstin', 'JTS40114', '5/27/2026', '5/27/2026', 350, 'JTS40114', 'IL to WI', 1000, 5, 50.00, 'Sent', 47.50, 2.50, 'Unpaid', 'Quick Pay'),
  ('May 2026', 7, 'import', 'Mikran', '5/27/2026', '26', 'Kenneth', 'TQL', '36938439', '5/28/2026', '5/28/2026', 89, '36938439', 'WI to WI', 325, 5, 16.25, 'Sent', 16.25, 0, 'Paid', 'Quick Pay'),
  ('May 2026', 8, 'import', 'Mikran', '5/27/2026', '26', 'Kenneth', 'Warp', '4696-2621', '5/28/2026', '5/28/2026', 210, '4696-2621', 'IL to IN', 514, 0, 0, 'No Fee', 0, 0, 'Paid', 'Quick Pay'),
  ('May 2026', 9, 'import', 'Mikran', '06/02/2026', '26', 'ANTHONY ROBISON', 'DFW National Logistics Inc', '533932', '06/02/2026', '06/02/2026', 241, '533932', 'TX-TX', 500, 6, 30.00, 'Sent', 30.00, 0, 'Paid', 'Quick Pay');

commit;

-- Verify
select month_tab, count(*) as loads, sum(rc_invoice) as total_rc, sum(dispatch_fee) as total_fee
from public.dispatch_loads
where month_tab in ('May 2026', 'June 2026') and deleted_at is null
group by month_tab
order by month_tab;
