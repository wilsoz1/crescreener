-- Origination spine: deals & facilities, parties, policy engine, risk rating, approvals,
-- conditions precedent, third-party orders, collateral, funding authorization,
-- screenings / e-sign / core-booking adapters (simulated until vendors are wired).

create table deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  customer_id uuid references customers(id) on delete set null,
  stage text not null default 'Application' check (stage in
    ('Prospect','Application','KYC','Underwriting','Approval','Conditions','Documentation','Closing','Funded','Declined','Withdrawn')),
  purpose text,
  probability numeric,
  expected_close date,
  rm text,
  rating int,
  rating_factors jsonb not null default '{}',
  rating_override int,
  override_reason text,
  override_by text,
  sources jsonb not null default '[]',
  uses jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table facilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  facility_type text not null,
  amount numeric not null,
  rate_display text,
  rate_pct numeric,            -- all-in rate used by the payment engine
  term_months int,
  amort_months int,            -- null = revolver / interest-only
  io_months int not null default 0,
  origination_fee_bps int not null default 0,
  loan_id uuid references loans(id) on delete set null,  -- set when booked to core
  created_at timestamptz not null default now()
);

create table deal_parties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  name text not null,
  role text not null check (role in ('Borrower','Co-borrower','Guarantor','Operating Co','RE Entity','Holding Co','Affiliate')),
  ownership_pct numeric,
  created_at timestamptz not null default now()
);

create table policy_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  metric text not null check (metric in ('ltv','dscr','total_amount','risk_rating','guarantor_liquidity')),
  op text not null check (op in ('gt','gte','lt','lte')),
  threshold numeric not null,
  action text not null,        -- 'exception' | 'route:Senior Credit Officer' | 'route:Loan Committee' | 'route:Special Assets'
  enabled boolean not null default true
);

create table deal_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  rule_name text not null,
  requirement text not null,
  actual text not null,
  explanation text,
  mitigants text,
  status text not null default 'open' check (status in ('open','approved','declined')),
  approver text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (deal_id, rule_name)
);

create table deal_approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  step_order int not null,
  role_label text not null,
  approver text,
  decision text not null default 'Pending' check (decision in
    ('Pending','Approved','Approved with conditions','Declined','Returned for changes','Abstained')),
  comment text,
  decided_at timestamptz
);

create table conditions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  category text not null check (category in ('Credit','Collateral','Legal','Documentation','Funding')),
  item text not null,
  owner text,
  due_date date,
  status text not null default 'open' check (status in ('open','received','satisfied','waived')),
  evidence text,
  waived_by text,
  created_at timestamptz not null default now()
);

create table third_party_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  report_type text not null,
  vendor text,
  ordered_date date,
  due_date date,
  received_date date,
  reviewed_by text,
  review_date date,
  expiration_date date,
  status text not null default 'ordered' check (status in ('ordered','received','reviewed','expired'))
);

create table collateral (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  loan_id uuid references loans(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  collateral_type text not null,
  description text,
  address text,
  value numeric not null,
  value_date date,
  value_source text default 'Appraisal',
  advance_rate numeric not null default 0.8,   -- fraction
  prior_liens numeric not null default 0,
  lien_position int not null default 1
);

create table funding_auths (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  commitment numeric not null,
  initial_advance numeric not null,
  payoffs numeric not null default 0,
  fees numeric not null default 0,
  net_proceeds numeric not null,
  wire_recipient text,
  wire_account_last4 text,
  prepared_by text,
  approved_by text,             -- second signer: maker/checker
  status text not null default 'draft' check (status in ('draft','pending_second','authorized','funded')),
  funded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Phase-5 adapters (simulated providers until real vendors are configured)
create table screenings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  party_name text not null,
  kind text not null check (kind in ('OFAC / sanctions','PEP','Identity','Business verification','Fraud indicators')),
  status text not null check (status in ('clear','hit','review')),
  provider text not null default 'simulated',
  checked_at timestamptz not null default now()
);

create table esign_envelopes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  title text not null,
  recipients jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft','sent','viewed','signed','declined')),
  provider text not null default 'simulated',
  sent_at timestamptz,
  completed_at timestamptz
);

create table core_bookings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  loan_id uuid references loans(id) on delete set null,
  payload jsonb not null,
  status text not null default 'transmitted' check (status in ('pending_review','transmitted','failed')),
  provider text not null default 'simulated',
  reviewed_by text,
  transmitted_at timestamptz not null default now()
);

-- RLS: org-scoped everywhere
do $$
declare t text;
begin
  foreach t in array array['deals','facilities','deal_parties','policy_rules','deal_exceptions','deal_approvals',
                           'conditions','third_party_orders','collateral','funding_auths','screenings','esign_envelopes','core_bookings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_all on %I for all using (is_org_member(org_id)) with check (is_org_member(org_id))', t, t);
  end loop;
end $$;

-- ——— Seed: policy rules + two demo deals per org ———
create or replace function seed_deals(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cust uuid; v_deal uuid; v_deal2 uuid; v_cascade uuid;
begin
  insert into policy_rules (org_id, name, metric, op, threshold, action) values
    (p_org, 'Max CRE LTV 75%', 'ltv', 'gt', 0.75, 'exception'),
    (p_org, 'Min DSCR 1.20x', 'dscr', 'lt', 1.20, 'exception'),
    (p_org, 'Loans over $5MM need SCO', 'total_amount', 'gt', 5000000, 'route:Senior Credit Officer'),
    (p_org, 'Risk rating 7+ to Special Assets', 'risk_rating', 'gte', 7, 'route:Special Assets');

  -- Deal 1: multi-facility package in Approval, with a live LTV exception
  insert into customers (org_id, name, company, email, phone) values
    (p_org, 'Dr. Alan Riverbend', 'Riverbend Medical Partners LLC', 'alan@riverbendmed.com', '+1 480 555 0192')
    returning id into v_cust;
  insert into deals (org_id, name, customer_id, stage, purpose, probability, expected_close, rm, rating,
                     rating_factors, sources, uses) values
    (p_org, 'Riverbend Medical Partners — acquisition package', v_cust, 'Approval',
     'Practice acquisition + equipment + working capital', 0.75, current_date + 45, 'D. Alvarez', 5,
     '{"financial":5,"leverage":6,"liquidity":4,"industry":4,"management":4,"collateral":5}',
     '[{"label":"Bank facilities","amount":5250000},{"label":"Borrower equity","amount":1350000}]',
     '[{"label":"Practice purchase price","amount":5400000},{"label":"Equipment","amount":750000},{"label":"Working capital","amount":300000},{"label":"Closing costs & fees","amount":150000}]')
    returning id into v_deal;
  insert into facilities (org_id, deal_id, facility_type, amount, rate_display, rate_pct, term_months, amort_months, io_months, origination_fee_bps) values
    (p_org, v_deal, 'Owner-occupied CRE term', 4000000, 'SOFR + 275 (all-in 7.25%)', 7.25, 120, 300, 0, 50),
    (p_org, v_deal, 'Equipment term', 750000, '7.10% fixed', 7.10, 60, 60, 0, 50),
    (p_org, v_deal, 'Working-capital revolver', 500000, 'Prime + 75 (all-in 8.25%)', 8.25, 12, null, 0, 25);
  insert into deal_parties (org_id, deal_id, customer_id, name, role, ownership_pct) values
    (p_org, v_deal, v_cust, 'Riverbend Medical Partners LLC', 'Borrower', null),
    (p_org, v_deal, null, 'Riverbend RE Holdings LLC', 'RE Entity', null),
    (p_org, v_deal, null, 'Dr. Alan Riverbend', 'Guarantor', 60),
    (p_org, v_deal, null, 'Dr. Maya Chen', 'Guarantor', 40);
  insert into deal_approvals (org_id, deal_id, step_order, role_label, approver, decision, comment, decided_at) values
    (p_org, v_deal, 1, 'Relationship Manager', 'D. Alvarez', 'Approved', 'Strong practice cash flow; 22-year operating history under selling owner.', now() - interval '2 days'),
    (p_org, v_deal, 2, 'Credit Officer', null, 'Pending', null, null),
    (p_org, v_deal, 3, 'Senior Credit Officer', null, 'Pending', null, null);
  insert into collateral (org_id, deal_id, customer_id, collateral_type, description, address, value, value_date, value_source, advance_rate, prior_liens, lien_position) values
    (p_org, v_deal, v_cust, 'Real estate', 'Medical office condo — 12,400 SF', '210 Mesa Ridge Dr, Chandler, AZ', 5100000, current_date - 20, 'Appraisal', 0.75, 0, 1),
    (p_org, v_deal, v_cust, 'Equipment', 'Imaging + dental operatory equipment (new)', null, 750000, current_date - 10, 'Cost', 0.80, 0, 1),
    (p_org, v_deal, v_cust, 'Business assets', 'Blanket UCC — all business assets', null, 900000, current_date - 30, 'Market', 0.50, 0, 1);
  insert into conditions (org_id, deal_id, category, item, owner, due_date, status) values
    (p_org, v_deal, 'Credit', 'Verify $1.35MM equity deposit', 'RM', current_date + 20, 'open'),
    (p_org, v_deal, 'Collateral', 'Phase I environmental — no RECs', 'Closing', current_date + 25, 'open'),
    (p_org, v_deal, 'Legal', 'Operating agreement + borrowing resolution', 'Borrower counsel', current_date + 15, 'received');
  insert into third_party_orders (org_id, deal_id, report_type, vendor, ordered_date, due_date, received_date, status, reviewed_by, review_date) values
    (p_org, v_deal, 'Appraisal', 'Southwest Valuation Group', current_date - 30, current_date - 5, current_date - 8, 'reviewed', 'M. Chen', current_date - 6),
    (p_org, v_deal, 'Phase I environmental', 'TerraCheck Environmental', current_date - 12, current_date + 10, null, 'ordered', null, null);
  insert into screenings (org_id, deal_id, party_name, kind, status) values
    (p_org, v_deal, 'Riverbend Medical Partners LLC', 'OFAC / sanctions', 'clear'),
    (p_org, v_deal, 'Riverbend Medical Partners LLC', 'Business verification', 'clear'),
    (p_org, v_deal, 'Dr. Alan Riverbend', 'OFAC / sanctions', 'clear'),
    (p_org, v_deal, 'Dr. Maya Chen', 'OFAC / sanctions', 'review');

  -- Deal 2: Cascade expansion in Conditions with e-sign + funding draft
  select id into v_cascade from customers where org_id = p_org and company = 'Cascade Fabrication Inc' limit 1;
  insert into deals (org_id, name, customer_id, stage, purpose, probability, expected_close, rm, rating, rating_factors) values
    (p_org, 'Cascade Fabrication — CNC line expansion', v_cascade, 'Conditions',
     'Second CNC line + install', 0.9, current_date + 20, 'J. Whitfield', 4,
     '{"financial":4,"leverage":4,"liquidity":5,"industry":4,"management":3,"collateral":4}')
    returning id into v_deal2;
  insert into facilities (org_id, deal_id, facility_type, amount, rate_display, rate_pct, term_months, amort_months, io_months, origination_fee_bps) values
    (p_org, v_deal2, 'Equipment term', 1200000, '7.35% fixed', 7.35, 72, 72, 6, 50);
  insert into deal_parties (org_id, deal_id, customer_id, name, role, ownership_pct) values
    (p_org, v_deal2, v_cascade, 'Cascade Fabrication Inc', 'Borrower', null),
    (p_org, v_deal2, null, 'Priya Raman', 'Guarantor', 100);
  insert into deal_approvals (org_id, deal_id, step_order, role_label, approver, decision, comment, decided_at) values
    (p_org, v_deal2, 1, 'Relationship Manager', 'J. Whitfield', 'Approved', null, now() - interval '9 days'),
    (p_org, v_deal2, 2, 'Credit Officer', 'S. Barrett', 'Approved with conditions', 'Condition: resolve past-due Aug payment before funding.', now() - interval '7 days');
  insert into conditions (org_id, deal_id, category, item, owner, due_date, status, evidence) values
    (p_org, v_deal2, 'Credit', 'Aug 28 payment on CL-2026-066 brought current', 'RM', current_date + 5, 'open', null),
    (p_org, v_deal2, 'Collateral', 'Equipment invoice + PMSI UCC-1 filing', 'Loan ops', current_date + 10, 'received', 'invoice_cnc_line2.pdf'),
    (p_org, v_deal2, 'Documentation', 'Signed loan agreement + guaranty', 'Closing', current_date + 12, 'open', null),
    (p_org, v_deal2, 'Funding', 'Dual-control funding authorization', 'Ops', current_date + 15, 'open', null);
  insert into collateral (org_id, deal_id, customer_id, collateral_type, description, value, value_date, value_source, advance_rate) values
    (p_org, v_deal2, v_cascade, 'Equipment', 'CNC machining line #2 (invoice cost)', 1420000, current_date - 5, 'Cost', 0.80);
  insert into esign_envelopes (org_id, deal_id, title, recipients, status, sent_at) values
    (p_org, v_deal2, 'Loan agreement + commercial guaranty', '[{"name":"Priya Raman","email":"praman@cascadefab.com"}]', 'sent', now() - interval '1 day');
  insert into funding_auths (org_id, deal_id, commitment, initial_advance, payoffs, fees, net_proceeds, wire_recipient, wire_account_last4, prepared_by, status) values
    (p_org, v_deal2, 1200000, 1136000, 0, 6000, 1130000, 'Haas Factory Outlet — escrow', '4417', 'M. Chen', 'draft');

  -- collateral records for already-booked loans
  insert into collateral (org_id, loan_id, customer_id, collateral_type, description, address, value, value_date, value_source, advance_rate)
  select p_org, l.id, l.customer_id, 'Real estate', '84,000 SF warehouse', '2200 Harbor Point Rd', 6250000, '2026-01-15', 'Appraisal', 0.75
  from loans l where l.org_id = p_org and l.loan_number = 'CL-2026-041';
  insert into collateral (org_id, loan_id, customer_id, collateral_type, description, value, value_date, value_source, advance_rate)
  select p_org, l.id, l.customer_id, 'Equipment', 'CNC equipment — PMSI', 1120000, '2026-06-01', 'Appraisal', 0.80
  from loans l where l.org_id = p_org and l.loan_number = 'CL-2026-066';
end $$;

select seed_deals(id) from orgs;

-- New orgs get the origination seed too.
do $do$
begin
  execute (
    select replace(pg_get_functiondef(p.oid), 'perform seed_servicing(v_org); return v_org;',
                   'perform seed_servicing(v_org); perform seed_deals(v_org); return v_org;')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_org'
  );
end $do$;
