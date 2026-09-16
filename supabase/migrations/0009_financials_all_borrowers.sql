-- Every borrower in the book gets reviewed spreads + a base cash-flow scenario,
-- so the portfolio's cash-flow story is complete (Cascade + Harbor Point were
-- seeded in 0004/0008; this covers Saguaro and Bluestem, idempotently).

create or replace function seed_financials(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid;
  v_guar uuid;
begin
  -- Saguaro Family Dentistry — solo practice, healthy and lightly levered.
  select id into v_cust from customers where org_id = p_org and company like 'Saguaro%' limit 1;
  if v_cust is not null then
    if not exists (select 1 from financial_spreads where customer_id = v_cust) then
      insert into financial_spreads (org_id, customer_id, period, statement_type, status, data) values
        (p_org, v_cust, 'FY 2024', 'Tax Return (1120-S)', 'reviewed',
         '{"revenue":2140000,"cogs":410000,"opex":1290000,"ebitda":440000,"depreciation":118000,"interest_expense":64000,"net_income":258000,"distributions":95000,"total_debt":1480000,"tangible_net_worth":520000}'),
        (p_org, v_cust, 'FY 2025', 'Tax Return (1120-S)', 'reviewed',
         '{"revenue":2310000,"cogs":435000,"opex":1360000,"ebitda":515000,"depreciation":121000,"interest_expense":71000,"net_income":323000,"distributions":120000,"total_debt":1615000,"tangible_net_worth":610000}');
    end if;
    if not exists (select 1 from cash_flow_scenarios where customer_id = v_cust) then
      v_guar := null;
      select g.id into v_guar from guarantors g join loans l on l.id = g.loan_id
        where l.org_id = p_org and l.customer_id = v_cust limit 1;
      insert into cash_flow_scenarios (org_id, customer_id, name, is_base, data) values
        (p_org, v_cust, 'As adjusted', true, jsonb_build_object(
          'periods', jsonb_build_object('FY 2025', jsonb_build_object('adjustments', jsonb_build_array(
            jsonb_build_object('id', 'seed-sg-1', 'label', 'One-time website & rebrand spend',
                               'amount', 38000, 'note', 'Non-recurring marketing project — invoices on file', 'by', 'Demo Banker')))),
          'guarantors', case when v_guar is null then '{}'::jsonb else jsonb_build_object(v_guar::text,
            jsonb_build_object('income', 295000, 'personal_debt', 62000, 'living', 96000)) end));
    end if;
  end if;

  -- Bluestem Pediatric Dental — bigger practice, tighter after a buildout year.
  select id into v_cust from customers where org_id = p_org and company like 'Bluestem%' limit 1;
  if v_cust is not null then
    if not exists (select 1 from financial_spreads where customer_id = v_cust) then
      insert into financial_spreads (org_id, customer_id, period, statement_type, status, data) values
        (p_org, v_cust, 'FY 2024', 'Tax Return (1065)', 'reviewed',
         '{"revenue":3420000,"cogs":690000,"opex":2050000,"ebitda":680000,"depreciation":205000,"interest_expense":188000,"net_income":287000,"distributions":175000,"total_debt":3280000,"tangible_net_worth":760000}'),
        (p_org, v_cust, 'FY 2025', 'Tax Return (1065)', 'reviewed',
         '{"revenue":3660000,"cogs":735000,"opex":2180000,"ebitda":745000,"depreciation":212000,"interest_expense":196000,"net_income":337000,"distributions":190000,"total_debt":3195000,"tangible_net_worth":880000}');
    end if;
    if not exists (select 1 from cash_flow_scenarios where customer_id = v_cust) then
      v_guar := null;
      select g.id into v_guar from guarantors g join loans l on l.id = g.loan_id
        where l.org_id = p_org and l.customer_id = v_cust limit 1;
      insert into cash_flow_scenarios (org_id, customer_id, name, is_base, data) values
        (p_org, v_cust, 'As adjusted', true, jsonb_build_object(
          'periods', jsonb_build_object('FY 2025', jsonb_build_object('adjustments', jsonb_build_array(
            jsonb_build_object('id', 'seed-bs-1', 'label', 'Operatory buildout — non-recurring',
                               'amount', 62000, 'note', 'Expensed portion of the 2025 buildout', 'by', 'Demo Banker')))),
          'guarantors', case when v_guar is null then '{}'::jsonb else jsonb_build_object(v_guar::text,
            jsonb_build_object('income', 340000, 'personal_debt', 118000, 'living', 105000)) end));
    end if;
  end if;
end $$;

select seed_financials(id) from orgs;

-- New orgs get complete financials too.
do $do$
begin
  execute (
    select replace(pg_get_functiondef(p.oid),
                   'perform seed_cashflows(v_org); return v_org;',
                   'perform seed_cashflows(v_org); perform seed_financials(v_org); return v_org;')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_org'
  );
end $do$;
