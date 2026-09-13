-- Relationship cash flows: the Excel global-cash-flow model, structured.
-- The template (line items + formulas) lives in code; a scenario stores only the
-- underwriter's judgment — overrides of extracted values, free-form add-backs,
-- guarantor inputs, and a proposed facility. Computed rows are never stored.
--
-- data jsonb shape:
-- {
--   "periods":    { "FY 2025": { "overrides": {"ebitda": 812000}, "adjustments":
--                   [{"id":"a1","label":"...","amount":85000,"note":"...","by":"..."}] } },
--   "guarantors": { "<guarantor_id>": { "income": 420000, "personal_debt": 96000, "living": 120000 } },
--   "proposed":   { "label": "...", "amount": 1200000, "rate_pct": 7.25, "amort_months": 300 }
-- }

create table cash_flow_scenarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  is_base boolean not null default false,
  data jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on cash_flow_scenarios (org_id, customer_id);
alter table cash_flow_scenarios enable row level security;
create policy cash_flow_scenarios_all on cash_flow_scenarios for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Demo seed: base + stressed scenarios for the two practices that carry spreads.
create or replace function seed_cashflows(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid;
  v_guar uuid;
begin
  -- Cascade Orthodontics: an add-back and guarantor inputs on the base case, plus a stress case.
  select id into v_cust from customers where org_id = p_org and company like 'Cascade%' limit 1;
  if v_cust is not null then
    select g.id into v_guar from guarantors g join loans l on l.id = g.loan_id
      where l.org_id = p_org and l.customer_id = v_cust limit 1;
    insert into cash_flow_scenarios (org_id, customer_id, name, is_base, data) values
      (p_org, v_cust, 'As adjusted', true, jsonb_build_object(
        'periods', jsonb_build_object(
          'FY 2025', jsonb_build_object('adjustments', jsonb_build_array(
            jsonb_build_object('id', 'seed-1', 'label', 'One-time operatory build-out write-off',
                               'amount', 85000, 'note', 'Contractor invoice on file — non-recurring', 'by', 'Demo Banker')))),
        'guarantors', case when v_guar is null then '{}'::jsonb else jsonb_build_object(v_guar::text,
          jsonb_build_object('income', 410000, 'personal_debt', 88000, 'living', 120000)) end)),
      (p_org, v_cust, 'Stressed', false, jsonb_build_object(
        'periods', jsonb_build_object(
          'FY 2025', jsonb_build_object(
            'overrides', jsonb_build_object('ebitda', 590000),
            'adjustments', jsonb_build_array(
              jsonb_build_object('id', 'seed-2', 'label', 'Revenue haircut — PPO reimbursement cut 15%',
                                 'amount', -60000, 'note', 'Stress assumption', 'by', 'Demo Banker')))),
        'proposed', jsonb_build_object('label', 'Proposed expansion loan', 'amount', 950000,
                                       'rate_pct', 7.5, 'amort_months', 240)));
  end if;

  -- Harbor Point Dental Group: clean base case with guarantor inputs.
  select id into v_cust from customers where org_id = p_org and company like 'Harbor Point%' limit 1;
  if v_cust is not null then
    v_guar := null;
    select g.id into v_guar from guarantors g join loans l on l.id = g.loan_id
      where l.org_id = p_org and l.customer_id = v_cust limit 1;
    insert into cash_flow_scenarios (org_id, customer_id, name, is_base, data) values
      (p_org, v_cust, 'As adjusted', true, jsonb_build_object(
        'guarantors', case when v_guar is null then '{}'::jsonb else jsonb_build_object(v_guar::text,
          jsonb_build_object('income', 385000, 'personal_debt', 104000, 'living', 110000)) end));
  end if;
end $$;

select seed_cashflows(id) from orgs;

-- New orgs get demo cash flows too.
do $do$
begin
  execute (
    select replace(pg_get_functiondef(p.oid),
                   'perform dentistize_org(v_org); return v_org;',
                   'perform dentistize_org(v_org); perform seed_cashflows(v_org); return v_org;')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_org'
  );
end $do$;
