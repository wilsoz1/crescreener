-- Follow-up to 0006: historical outreach attempts kept the old recipient domains.
create or replace function dentistize_emails(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update outreach_attempts set recipient = replace(replace(replace(replace(recipient,
    'harborpointlog.com', 'harborpointdental.com'),
    'saguaroretail.com', 'saguarodental.com'),
    'cascadefab.com', 'cascadeortho.com'),
    'bluestemag.com', 'bluestemdental.com')
  where org_id = p_org;
end $$;

select dentistize_emails(id) from orgs;

-- Fold into dentistize_org so future orgs get it too.
do $do$
begin
  execute (
    select replace(pg_get_functiondef(p.oid),
                   $body$'BBC also outstanding', 'production report also outstanding') where org_id = p_org;$body$,
                   $body$'BBC also outstanding', 'production report also outstanding') where org_id = p_org;
  perform dentistize_emails(p_org);$body$)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dentistize_org'
  );
end $do$;
