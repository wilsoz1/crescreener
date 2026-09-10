-- Financial spreads (populated from uploaded tax returns / financial statements) + richer review seed.

create table financial_spreads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  source_document_id uuid references documents(id) on delete set null,
  period text not null,                -- e.g. 'FY 2025', 'T-12 Jun 2026'
  statement_type text not null default 'Financial Statement',
  status text not null default 'draft' check (status in ('draft','reviewed')),
  data jsonb not null default '{}',    -- line items keyed by SPREAD_LINES in the UI
  created_at timestamptz not null default now()
);
alter table financial_spreads enable row level security;
create policy financial_spreads_all on financial_spreads for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Seed: two periods for Cascade and Harbor Point in every existing org, and annual-review
-- ticklers on two more loans so the Covenant / Annual review mix is visible.
do $$
declare o record; l record; c uuid;
begin
  for o in select id from orgs loop
    for l in select id, loan_number, customer_id from loans where org_id = o.id loop
      if l.loan_number = 'CL-2026-066' and l.customer_id is not null then
        insert into ticklers (org_id, loan_id, requirement, responsible, frequency, due_date, status, source)
        values (o.id, l.id, 'Annual review', 'Portfolio mgr', 'Annual', '2026-12-31', 'open', 'Policy');
        insert into financial_spreads (org_id, customer_id, period, statement_type, status, data) values
          (o.id, l.customer_id, 'FY 2024', 'Tax Return (1120-S)', 'reviewed',
           '{"revenue":5210000,"cogs":3480000,"opex":1140000,"ebitda":590000,"depreciation":210000,"interest_expense":96000,"net_income":284000,"distributions":120000,"total_debt":1890000,"tangible_net_worth":1120000}'),
          (o.id, l.customer_id, 'FY 2025', 'Tax Return (1120-S)', 'reviewed',
           '{"revenue":5640000,"cogs":3720000,"opex":1230000,"ebitda":690000,"depreciation":225000,"interest_expense":118000,"net_income":347000,"distributions":150000,"total_debt":2110000,"tangible_net_worth":1290000}');
      end if;
      if l.loan_number = 'CL-2026-041' and l.customer_id is not null then
        insert into financial_spreads (org_id, customer_id, period, statement_type, status, data) values
          (o.id, l.customer_id, 'FY 2024', 'Tax Return (1065)', 'reviewed',
           '{"revenue":6910000,"cogs":3980000,"opex":1860000,"ebitda":1070000,"depreciation":335000,"interest_expense":262000,"net_income":473000,"distributions":240000,"total_debt":4310000,"tangible_net_worth":1650000}'),
          (o.id, l.customer_id, 'T-12 Jun 2026', 'Internal interim', 'draft',
           '{"revenue":7260000,"cogs":4140000,"opex":2010000,"ebitda":1110000,"depreciation":340000,"interest_expense":268000,"net_income":502000,"distributions":250000,"total_debt":4270000,"tangible_net_worth":1780000}');
      end if;
      if l.loan_number = 'CL-2026-057' then
        insert into ticklers (org_id, loan_id, requirement, responsible, frequency, due_date, status, source)
        values (o.id, l.id, 'Annual review', 'Portfolio mgr', 'Annual', '2027-01-31', 'open', 'Policy');
      end if;
    end loop;
  end loop;
end $$;
