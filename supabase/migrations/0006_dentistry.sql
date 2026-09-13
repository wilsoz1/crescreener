-- Dentistry focus: the book becomes dental-practice lending.
-- Loan types collapse to: Expansion loan | Start-up loan | Owner-Occupied CRE.
-- One canonical normalizer runs on every org (backfill now, and after each new-org seed).

create or replace function dentistize_org(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Borrowers become dental practices
  update customers set company = 'Harbor Point Dental Group',   email = replace(email, 'harborpointlog.com', 'harborpointdental.com') where org_id = p_org and company like 'Harbor Point%';
  update customers set company = 'Saguaro Family Dentistry',    email = replace(email, 'saguaroretail.com', 'saguarodental.com')      where org_id = p_org and company like 'Saguaro%';
  update customers set company = 'Cascade Orthodontics',        email = replace(email, 'cascadefab.com', 'cascadeortho.com')          where org_id = p_org and company like 'Cascade%';
  update customers set company = 'Bluestem Pediatric Dental',   email = replace(email, 'bluestemag.com', 'bluestemdental.com')        where org_id = p_org and company like 'Bluestem%';
  update customers set company = 'Riverbend Dental Partners LLC' where org_id = p_org and company like 'Riverbend%';

  -- Loan types → the dental product set
  update loans set type = case
    when type in ('Investor CRE', 'Agricultural RE', 'Owner-Occupied CRE') then 'Owner-Occupied CRE'
    when type in ('Construction', 'Equipment', 'Equipment term', 'Business Acquisition') then 'Expansion loan'
    when type in ('Working Capital LOC', 'Investor CRE term') then 'Start-up loan'
    else type end
  where org_id = p_org;

  -- Collateral descriptions
  update loans set collateral = replace(collateral, '84,000 SF warehouse', '12,400 SF dental office')            where org_id = p_org;
  update loans set collateral = replace(collateral, 'CNC equipment — PMSI', 'Imaging & operatory equipment — PMSI') where org_id = p_org;
  update loans set collateral = replace(collateral, 'CNC machining line #2', 'CBCT imaging + 4 operatory build-outs') where org_id = p_org;
  update loans set collateral = replace(collateral, '640 ac farmland', 'dental office building')                 where org_id = p_org;
  update loans set collateral = replace(collateral, 'A/R + inventory', 'practice A/R')                           where org_id = p_org;
  update loans set collateral = replace(collateral, 'medical office (construction)', 'new operatory build-out')  where org_id = p_org;
  update loans set collateral = replace(collateral, 'Lakeside Crossing', 'Mesa Ridge Dental Building')           where org_id = p_org;
  update collateral set description = replace(replace(replace(description,
    '84,000 SF warehouse', '12,400 SF dental office'),
    'CNC equipment — PMSI', 'Imaging & operatory equipment — PMSI'),
    'CNC machining line #2 (invoice cost)', 'CBCT imaging suite + operatory build-out (invoice cost)')
  where org_id = p_org;

  -- Account & line names
  update deposits set account_name = replace(account_name, 'harvest CD', 'practice reserve CD') where org_id = p_org;
  update credit_lines set name = replace(replace(name, 'borrowing base LOC', 'equipment line'), 'operating line', 'practice operating line') where org_id = p_org;

  -- Ticklers that don't fit dentistry
  update ticklers set requirement = replace(requirement, 'borrowing-base certificate', 'practice production report') where org_id = p_org;
  update outreach_rules set body = replace(body, 'borrowing-base certificate', 'practice production report') where org_id = p_org;
  update outreach_attempts set body = replace(body, 'borrowing-base certificate', 'practice production report') where org_id = p_org;
  update loan_notes set body = replace(replace(body, 'warehouse at ~92% rack utilization', 'practice at 92% chair utilization'), 'new 3PL contract', 'new PPO contract') where org_id = p_org;
  update loan_notes set body = replace(replace(body, 'large receivable from prime contractor', 'delayed insurance reimbursements'), 'BBC also outstanding', 'production report also outstanding') where org_id = p_org;
end $$;

select dentistize_org(id) from orgs;

-- New orgs get dentistized right after seeding.
do $do$
begin
  execute (
    select replace(pg_get_functiondef(p.oid),
                   'perform seed_servicing(v_org); perform seed_deals(v_org); return v_org;',
                   'perform seed_servicing(v_org); perform seed_deals(v_org); perform dentistize_org(v_org); return v_org;')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_org'
  );
end $do$;
