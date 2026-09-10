-- Loan payment structure + draw periods, and protected document share links.

alter table loans add column payment_type text not null default 'P&I'
  check (payment_type in ('P&I','I/O','Deferred','I/O Deferred','Construction'));
alter table loans add column draw_period_end date;
alter table loans add column origination_date date;

-- Protected share links: unguessable token, expiry, revocable, access-logged.
create table share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  institution text not null,
  expires_at timestamptz not null default now() + interval '14 days',
  revoked boolean not null default false,
  access_count int not null default 0,
  last_accessed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table share_links enable row level security;
create policy share_links_all on share_links for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));
-- No anon policy: the public share page goes through the share-docs edge function.

-- Enrich existing demo data with payment structure.
update loans set payment_type = 'I/O', origination_date = '2026-09-01' where type = 'Working Capital LOC';
update loans set payment_type = 'P&I', origination_date = '2026-03-15' where loan_number = 'CL-2026-041';
update loans set payment_type = 'I/O Deferred', origination_date = '2026-10-01' where loan_number = 'CL-2026-087';
update loans set origination_date = coalesce(origination_date, '2026-06-01');

-- Give every existing org a construction loan so draw-period filters have data.
insert into loans (org_id, customer_id, loan_number, type, stage, amount, rate, term, ltv, maturity,
                   collateral, rm, payment_type, draw_period_end, origination_date)
select o.id,
       (select c.id from customers c where c.org_id = o.id order by c.created_at limit 1),
       'CL-2026-101', 'Construction', 'Servicing', 6400000, 'SOFR + 325', '3 / IO', 0.65, '2029-04-01',
       '1st DOT — medical office (construction)', 'D. Alvarez', 'Construction', '2027-10-01', '2026-04-01'
from orgs o;

-- Re-seed function: new orgs get the same variety.
create or replace function create_org(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into orgs (name, created_by) values (p_name, auth.uid()) returning id into v_org;
  insert into org_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');

  insert into customers (org_id, name, company, email, phone) values
    (v_org, 'Marcus Ito', 'Harbor Point Logistics LLC', 'm.ito@harborpointlog.com', '+1 480 555 0141') returning id into c1;
  insert into customers (org_id, name, company, email, phone) values
    (v_org, 'Ramon Delgado', 'Saguaro Retail Partners LLC', 'ramon@saguaroretail.com', '+1 602 555 0187') returning id into c2;
  insert into customers (org_id, name, company, email, phone) values
    (v_org, 'Priya Raman', 'Cascade Fabrication Inc', 'praman@cascadefab.com', '+1 503 555 0112') returning id into c3;
  insert into customers (org_id, name, company, email, phone) values
    (v_org, 'Elena Voss', 'Bluestem Ag Partners', 'evoss@bluestemag.com', '+1 785 555 0163') returning id into c4;

  insert into loans (org_id, customer_id, loan_number, type, stage, amount, rate, term, ltv, dscr, maturity, collateral, rm, payment_type, draw_period_end, origination_date) values
    (v_org, c1, 'CL-2026-041', 'Owner-Occupied CRE', 'Servicing', 4250000, 'SOFR + 275', '10 / 25', 0.68, 1.74, '2036-03-15', '1st DOT — warehouse', 'D. Alvarez', 'P&I', null, '2026-03-15'),
    (v_org, c2, 'CL-2026-087', 'Investor CRE', 'Underwriting', 9500000, 'SOFR + 250', '10 / 25', 0.669, 1.34, '2036-10-01', '1st DOT — Lakeside Crossing', 'K. Ostrander', 'I/O Deferred', null, '2026-10-01'),
    (v_org, c3, 'CL-2026-066', 'Equipment', 'Servicing', 900000, '7.10% fixed', '5 / 5', 0.80, 1.55, '2031-10-15', 'CNC equipment — PMSI', 'J. Whitfield', 'P&I', null, '2026-06-01'),
    (v_org, c4, 'CL-2026-057', 'Agricultural RE', 'Closing', 2800000, '6.85% fixed', '5 / 20', 0.62, 1.41, '2031-08-01', '1st DOT — 640 ac farmland', 'K. Ostrander', 'Deferred', null, '2026-06-01'),
    (v_org, c1, 'CL-2026-092', 'Working Capital LOC', 'Approval', 750000, 'Prime + 75', '1 / —', null, null, '2027-09-30', 'A/R + inventory', 'D. Alvarez', 'I/O', null, '2026-09-01'),
    (v_org, c2, 'CL-2026-101', 'Construction', 'Servicing', 6400000, 'SOFR + 325', '3 / IO', 0.65, null, '2029-04-01', '1st DOT — medical office (construction)', 'D. Alvarez', 'Construction', '2027-10-01', '2026-04-01');

  insert into deposits (org_id, customer_id, account_name, type, balance, opened) values
    (v_org, c1, 'Harbor Point operating', 'checking', 412000, '2018-11-02'),
    (v_org, c1, 'Harbor Point reserve', 'money_market', 265000, '2020-04-16'),
    (v_org, c2, 'Saguaro operating', 'checking', 188400, '2026-08-20'),
    (v_org, c3, 'Cascade operating', 'checking', 97200, '2023-06-16'),
    (v_org, c4, 'Bluestem harvest CD', 'cd', 500000, '2025-12-01');

  insert into credit_lines (org_id, customer_id, name, commitment, outstanding, rate, maturity) values
    (v_org, c1, 'Harbor Point revolver', 500000, 210000, 'Prime + 50', '2027-06-30'),
    (v_org, c3, 'Cascade borrowing base LOC', 1200000, 890000, 'SOFR + 300', '2027-03-31'),
    (v_org, c4, 'Bluestem operating line', 2000000, 340000, 'Prime + 25', '2027-01-15');

  insert into outreach_attempts (org_id, customer_id, channel, recipient, subject, body, status, created_by) values
    (v_org, c1, 'email', 'm.ito@harborpointlog.com', '2025 CPA-reviewed financials — past due', 'Hi Marcus, a reminder that the CPA-reviewed statements required by §6.01(a) were due Apr 30.', 'simulated', auth.uid()),
    (v_org, c3, 'sms', '+1 503 555 0112', null, 'Reminder: Q2 borrowing-base certificate was due Jul 20. Reply STOP to opt out.', 'simulated', auth.uid());

  return v_org;
end $$;
