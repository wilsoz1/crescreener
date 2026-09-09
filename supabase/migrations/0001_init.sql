-- CRE Screener: orgs, portfolio, outreach, documents — all org-scoped with RLS.

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text
);

-- security definer so RLS policies can check membership without recursing
create function is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from org_members where org_id = org and user_id = auth.uid()) $$;

create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table loans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  loan_number text not null,
  type text not null,
  stage text not null default 'Application' check (stage in ('Application','Underwriting','Approval','Closing','Servicing')),
  amount numeric not null default 0,
  rate text,
  term text,
  ltv numeric,
  dscr numeric,
  maturity date,
  collateral text,
  rm text,
  created_at timestamptz not null default now()
);

create table deposits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  account_name text not null,
  type text not null check (type in ('checking','savings','money_market','cd')),
  balance numeric not null default 0,
  opened date,
  created_at timestamptz not null default now()
);

create table credit_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  name text not null,
  commitment numeric not null,
  outstanding numeric not null default 0,
  rate text,
  maturity date,
  created_at timestamptz not null default now()
);

create table outreach_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  channel text not null check (channel in ('email','sms')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null check (status in ('sent','failed','simulated')),
  provider_id text,
  error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  loan_id uuid references loans(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  filename text not null,
  storage_path text not null,
  doc_type text not null default 'Unclassified',
  confidence numeric not null default 0,
  status text not null default 'needs_review' check (status in ('routed','needs_review')),
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ——— RLS ———
alter table orgs enable row level security;
alter table org_members enable row level security;
alter table profiles enable row level security;
alter table customers enable row level security;
alter table loans enable row level security;
alter table deposits enable row level security;
alter table credit_lines enable row level security;
alter table outreach_attempts enable row level security;
alter table documents enable row level security;

create policy org_select on orgs for select using (is_org_member(id));
create policy members_select on org_members for select using (is_org_member(org_id));
create policy profiles_own on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy customers_all on customers for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy loans_all on loans for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy deposits_all on deposits for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy credit_lines_all on credit_lines for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy outreach_select on outreach_attempts for select using (is_org_member(org_id));
create policy outreach_insert on outreach_attempts for insert with check (is_org_member(org_id) and created_by = auth.uid());
create policy documents_all on documents for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ——— Org bootstrap + demo seed (security definer avoids chicken-and-egg RLS) ———
create function create_org(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid; l1 uuid; l2 uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into orgs (name, created_by) values (p_name, auth.uid()) returning id into v_org;
  insert into org_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');

  -- demo seed so the dashboard is alive on first login
  insert into customers (org_id, name, company, email, phone) values
    (v_org, 'Marcus Ito', 'Harbor Point Logistics LLC', 'm.ito@harborpointlog.com', '+1 480 555 0141') returning id into c1;
  insert into customers (org_id, name, company, email, phone) values
    (v_org, 'Ramon Delgado', 'Saguaro Retail Partners LLC', 'ramon@saguaroretail.com', '+1 602 555 0187') returning id into c2;
  insert into customers (org_id, name, company, email, phone) values
    (v_org, 'Priya Raman', 'Cascade Fabrication Inc', 'praman@cascadefab.com', '+1 503 555 0112') returning id into c3;
  insert into customers (org_id, name, company, email, phone) values
    (v_org, 'Elena Voss', 'Bluestem Ag Partners', 'evoss@bluestemag.com', '+1 785 555 0163') returning id into c4;

  insert into loans (org_id, customer_id, loan_number, type, stage, amount, rate, term, ltv, dscr, maturity, collateral, rm) values
    (v_org, c1, 'CL-2026-041', 'Owner-Occupied CRE', 'Servicing', 4250000, 'SOFR + 275', '10 / 25', 0.68, 1.74, '2036-03-15', '1st DOT — warehouse', 'D. Alvarez') returning id into l1;
  insert into loans (org_id, customer_id, loan_number, type, stage, amount, rate, term, ltv, dscr, maturity, collateral, rm) values
    (v_org, c2, 'CL-2026-087', 'Investor CRE', 'Underwriting', 9500000, 'SOFR + 250', '10 / 25', 0.669, 1.34, '2036-10-01', '1st DOT — Lakeside Crossing', 'K. Ostrander') returning id into l2;
  insert into loans (org_id, customer_id, loan_number, type, stage, amount, rate, term, ltv, dscr, maturity, collateral, rm) values
    (v_org, c3, 'CL-2026-066', 'Equipment', 'Servicing', 900000, '7.10% fixed', '5 / 5', 0.80, 1.55, '2031-10-15', 'CNC equipment — PMSI', 'J. Whitfield'),
    (v_org, c4, 'CL-2026-057', 'Agricultural RE', 'Closing', 2800000, '6.85% fixed', '5 / 20', 0.62, 1.41, '2031-08-01', '1st DOT — 640 ac farmland', 'K. Ostrander'),
    (v_org, c1, 'CL-2026-092', 'Working Capital LOC', 'Approval', 750000, 'Prime + 75', '1 / —', null, null, '2027-09-30', 'A/R + inventory', 'D. Alvarez');

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

create function join_org(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into v_org from orgs where invite_code = lower(p_code);
  if v_org is null then raise exception 'invalid invite code'; end if;
  insert into org_members (org_id, user_id) values (v_org, auth.uid()) on conflict do nothing;
  return v_org;
end $$;

-- ——— Storage: private per-org documents bucket; paths are <org_id>/<file> ———
insert into storage.buckets (id, name, public) values ('documents', 'documents', false);

create policy docs_read on storage.objects for select
  using (bucket_id = 'documents' and is_org_member((storage.foldername(name))[1]::uuid));
create policy docs_write on storage.objects for insert
  with check (bucket_id = 'documents' and is_org_member((storage.foldername(name))[1]::uuid));
create policy docs_delete on storage.objects for delete
  using (bucket_id = 'documents' and is_org_member((storage.foldername(name))[1]::uuid));
