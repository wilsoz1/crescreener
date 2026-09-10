-- Servicing depth: balances & payment mechanics, payment history (past-due tracking),
-- covenants, ticklers, guarantors, loan notes, delinquency outreach rules, share hardening.

alter table loans
  add column current_balance numeric,
  add column next_payment_amount numeric,
  add column next_payment_date date,
  add column io_end_date date,
  add column rate_reset_date date,
  add column rate_floor text,
  add column budget_total numeric,
  add column draws_to_date numeric,
  add column interest_reserve_remaining numeric;

create table loan_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  due_date date not null,
  amount numeric not null,
  status text not null default 'due' check (status in ('due','paid','late','missed')),
  paid_date date,
  created_at timestamptz not null default now()
);

create table covenants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  name text not null,
  requirement text not null,
  actual text,
  status text not null default 'Pass' check (status in ('Pass','Near','Fail')),
  frequency text,
  next_test date,
  source text,
  created_at timestamptz not null default now()
);

create table ticklers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  requirement text not null,
  responsible text not null default 'Borrower',
  frequency text,
  due_date date not null,
  status text not null default 'open' check (status in ('open','requested','complete','waived')),
  source text,
  created_at timestamptz not null default now()
);

create table guarantors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  name text not null,
  guarantee_pct numeric,
  guarantee_type text default 'Unlimited',
  pfs_date date,
  net_worth numeric,
  liquidity numeric,
  created_at timestamptz not null default now()
);

create table loan_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  body text not null,
  author text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Delinquency rules: when a payment is N+ days past due, send templated outreach.
create table outreach_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  days_past_due int not null,
  channel text not null check (channel in ('email','sms','both')),
  subject text,
  body text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table outreach_attempts
  add column rule_id uuid references outreach_rules(id) on delete set null,
  add column payment_id uuid references loan_payments(id) on delete set null;

-- Share hardening: optional passcode + per-document selection (null = all docs).
alter table share_links
  add column passcode text,
  add column doc_ids uuid[];

-- RLS
alter table loan_payments enable row level security;
alter table covenants enable row level security;
alter table ticklers enable row level security;
alter table guarantors enable row level security;
alter table loan_notes enable row level security;
alter table outreach_rules enable row level security;
create policy loan_payments_all on loan_payments for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy covenants_all on covenants for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy ticklers_all on ticklers for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy guarantors_all on guarantors for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy loan_notes_all on loan_notes for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy outreach_rules_all on outreach_rules for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ——— Servicing seed, reusable for backfill and for new orgs ———
create or replace function seed_servicing(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  declare o record;
  begin
    select p_org as id into o;
    for l in select id, loan_number, amount, customer_id from loans where org_id = o.id loop
      case l.loan_number
      when 'CL-2026-041' then
        update loans set current_balance = 4118000, next_payment_amount = 29200, next_payment_date = '2026-10-01',
          rate_reset_date = '2031-03-15', rate_floor = '6.50%' where id = l.id;
        insert into loan_payments (org_id, loan_id, due_date, amount, status, paid_date) values
          (o.id, l.id, '2026-07-01', 29200, 'paid', '2026-07-01'),
          (o.id, l.id, '2026-08-01', 29200, 'paid', '2026-08-09'),
          (o.id, l.id, '2026-09-01', 29200, 'paid', '2026-09-01');
        insert into covenants (org_id, loan_id, name, requirement, actual, status, frequency, next_test, source) values
          (o.id, l.id, 'Minimum DSCR', '≥ 1.25x on FYE statements', '1.74x (FY 2025)', 'Pass', 'Annual', '2027-04-30', 'LA §6.12(a)'),
          (o.id, l.id, 'Fixed-charge coverage', '≥ 1.20x tested quarterly', '1.18x (Q2 2026)', 'Near', 'Quarterly', '2026-10-15', 'LA §6.12(b)'),
          (o.id, l.id, 'Max Debt / TNW', '≤ 3.5x', '2.4x', 'Pass', 'Quarterly', '2026-10-15', 'LA §6.12(c)');
        insert into ticklers (org_id, loan_id, requirement, responsible, frequency, due_date, status, source) values
          (o.id, l.id, 'CPA-reviewed annual financial statements', 'Borrower', 'Annual · 120 days after FYE', '2026-04-30', 'requested', 'LA §6.01(a)'),
          (o.id, l.id, 'Q3 interim financial statements', 'Borrower', 'Quarterly · 45 days', '2026-11-14', 'open', 'LA §6.01(b)'),
          (o.id, l.id, 'Property insurance renewal', 'Agent', 'Annual', '2026-08-09', 'requested', 'LA §5.04'),
          (o.id, l.id, 'Annual review', 'Portfolio mgr', 'Annual', '2026-09-30', 'open', 'Policy');
        insert into guarantors (org_id, loan_id, name, guarantee_pct, pfs_date, net_worth, liquidity) values
          (o.id, l.id, 'Marcus Ito', 100, '2026-01-15', 4800000, 610000),
          (o.id, l.id, 'Priya Raman', 100, '2026-02-02', 3200000, 480000);
        insert into loan_notes (org_id, loan_id, body, author) values
          (o.id, l.id, 'Site visit 8/20 — warehouse at ~92% rack utilization; discussed FCC trend, borrower expects Q3 rebound after new 3PL contract starts Sep 1.', 'D. Alvarez');
      when 'CL-2026-066' then
        update loans set current_balance = 812000, next_payment_amount = 17850, next_payment_date = '2026-08-28' where id = l.id;
        insert into loan_payments (org_id, loan_id, due_date, amount, status, paid_date) values
          (o.id, l.id, '2026-06-28', 17850, 'paid', '2026-06-28'),
          (o.id, l.id, '2026-07-28', 17850, 'paid', '2026-08-04'),
          (o.id, l.id, '2026-08-28', 17850, 'missed', null);
        insert into ticklers (org_id, loan_id, requirement, responsible, frequency, due_date, status, source) values
          (o.id, l.id, 'Q2 borrowing-base certificate', 'Borrower', 'Quarterly', '2026-07-20', 'requested', 'LA §6.02');
        insert into covenants (org_id, loan_id, name, requirement, actual, status, frequency, next_test, source) values
          (o.id, l.id, 'Minimum fixed-charge coverage', '≥ 1.15x', '1.21x (FY 2025)', 'Pass', 'Annual', '2027-03-31', 'LA §5.9');
        insert into guarantors (org_id, loan_id, name, guarantee_pct, pfs_date, net_worth, liquidity) values
          (o.id, l.id, 'Priya Raman', 100, '2026-02-02', 3200000, 480000);
        insert into loan_notes (org_id, loan_id, body, author) values
          (o.id, l.id, 'Aug payment missed; controller says large receivable from prime contractor slipped to mid-Sep. Watch closely; BBC also outstanding.', 'J. Whitfield');
      when 'CL-2026-101' then
        update loans set current_balance = 2450000, budget_total = 7600000, draws_to_date = 2450000,
          interest_reserve_remaining = 312000, io_end_date = '2027-10-01', next_payment_amount = 0, next_payment_date = null where id = l.id;
        insert into ticklers (org_id, loan_id, requirement, responsible, frequency, due_date, status, source) values
          (o.id, l.id, 'Monthly construction inspection', 'Inspector', 'Monthly', '2026-09-25', 'open', 'CLA §4.2'),
          (o.id, l.id, 'Updated builder''s risk evidence', 'Agent', 'Annual', '2027-04-01', 'open', 'CLA §5.1');
        insert into covenants (org_id, loan_id, name, requirement, actual, status, frequency, next_test, source) values
          (o.id, l.id, 'Loan-in-balance', 'Remaining sources ≥ cost to complete', 'In balance ($180K cushion)', 'Pass', 'Each draw', '2026-09-25', 'CLA §3.6');
      when 'CL-2026-087' then
        update loans set current_balance = 0, io_end_date = '2029-10-01', rate_floor = '6.25%' where id = l.id;
      when 'CL-2026-057' then
        update loans set current_balance = 2800000, next_payment_amount = 21400, next_payment_date = '2026-10-01' where id = l.id;
        insert into covenants (org_id, loan_id, name, requirement, actual, status, frequency, next_test, source) values
          (o.id, l.id, 'Minimum working capital', '≥ $400K', '$355K (Jun 2026)', 'Fail', 'Semiannual', '2026-12-31', 'LA §6.10(b)');
        insert into ticklers (org_id, loan_id, requirement, responsible, frequency, due_date, status, source) values
          (o.id, l.id, 'UCC continuation', 'Loan ops', 'Every 5 years', '2026-09-14', 'open', 'SA §3.3');
      when 'CL-2026-092' then
        update loans set current_balance = 480000, next_payment_amount = 4100, next_payment_date = '2026-09-30' where id = l.id;
      else null;
      end case;
    end loop;

    insert into outreach_rules (org_id, days_past_due, channel, subject, body) values
      (o.id, 5, 'email', 'Payment past due — {{loan_number}}',
       'Hi {{name}}, our records show the {{due_date}} payment of {{amount}} on loan {{loan_number}} ({{company}}) is {{days_late}} days past due. Please remit at your earliest convenience or reply to discuss. — {{lender}}'),
      (o.id, 10, 'both', 'URGENT: payment {{days_late}} days past due — {{loan_number}}',
       '{{name}}, the {{due_date}} payment of {{amount}} on {{loan_number}} is now {{days_late}} days past due. Please contact your relationship manager today. — {{lender}}');
  end;
end $$;

-- Backfill every existing org.
select seed_servicing(id) from orgs;

-- New orgs get servicing data too.
do $do$
begin
  -- Re-create create_org to call seed_servicing after the 0002 seed.
  -- (Body identical to 0002 except the final perform.)
  execute (
    select replace(pg_get_functiondef(p.oid), 'return v_org;', 'perform seed_servicing(v_org); return v_org;')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_org'
  );
end $do$;

-- ——— Daily rules run via pg_cron → run-rules edge function (best effort) ———
do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  perform cron.schedule('daily-delinquency-rules', '0 14 * * *',
    $cron$select net.http_post('https://ngmpmyuwacwbwtqtinos.supabase.co/functions/v1/run-rules', body := '{}'::jsonb)$cron$);
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
